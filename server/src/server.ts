import {
  CompletionItem, CompletionItemTag, createConnection, DefinitionParams, Diagnostic, DiagnosticSeverity, DidChangeConfigurationNotification,
  DocumentSymbol, DocumentSymbolParams, DocumentUri, HoverParams, InitializeParams, InitializeResult, Location, Position, ProposedFeatures,
  Range, ReferenceParams, SignatureHelpParams, SignatureInformation, SymbolKind, TextDocumentPositionParams, TextDocuments, TextDocumentSyncKind,
  WorkspaceFolder,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from './parser/parser';
import { Bounds } from './parser/types';
import { CodeSymbolType, CodeSymbol } from './parser/symbols';
import { DefinitionsUsages, DefinitionsUsagesLookup, DefUsageScope, findDefinitionsUsages } from './parser/definitions-usages';
import { ParseError, Warning } from './parser/errors';
import { Builtins, BuiltinFunctionInfo } from './parser/builtins';
import { isIdentifierPart } from './parser/lexer';
import ResolvedFile, { FileResolver } from './parser/file-resolver';
import { Chunk, Include } from './parser/statements';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { findProjects, getProjectFiles, iterateProject, ParsedDocumentsMap, Project, ProjectDocument, ProjectDocumentNode, projectToString } from './projects';
import { toReadableObj } from './parser/ast';

console.log('PICO-8 Language Server starting.');

const connection = createConnection(ProposedFeatures.all);

const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

let parsedDocuments: ParsedDocumentsMap = new Map();
let projects: Project[] = [];
let projectsByFilename: Map<string, Project> = new Map();

// Set up some initial configs
connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(capabilities.workspace && capabilities.workspace.configuration);
  hasWorkspaceFolderCapability = !!(capabilities.workspace && capabilities.workspace.workspaceFolders);

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      documentSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      completionProvider: { triggerCharacters: [ '.', ':' ], resolveProvider: true },
      hoverProvider: true,
      signatureHelpProvider: { triggerCharacters: [ '(' ], retriggerCharacters: [ ',' ] },
    },
  };

  if (hasWorkspaceFolderCapability) {
    // Let the client know we support workspace folders (if they do)
    result.capabilities.workspace = {
      workspaceFolders: { supported: true },
    };
  }

  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all config changes
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }

  if (hasWorkspaceFolderCapability) {
    // Register for workspace change folders event -- just logging it out for now
    connection.workspace.onDidChangeWorkspaceFolders(event => {
      connection.console.log('Workspace folder change event received: ' + JSON.stringify(event));
    });
  }

  rescanEverything();
});

function rescanEverything() {
  connection.workspace.getWorkspaceFolders().then((workspaceFolders: WorkspaceFolder[] | null) => {
    if (!workspaceFolders) {
      return;
    }

    Promise.all(workspaceFolders.map(scanWorkspaceFolder)).catch(e => {
      console.log('Error scanning workspace folders', e);
    });
  }).catch(reason => {
    console.log('Failed to get workspace folder(s):', reason);
  });
}

async function scanWorkspaceFolder(workspaceFolder: WorkspaceFolder) {
  const folderPath = url.fileURLToPath(workspaceFolder.uri);

  // List all files in directory & subdirs
  const allFiles = await getFilesRecursive(folderPath);

  // Load contents of each file & transform to TextDocument type
  const textDocuments = await Promise.all(allFiles.map(createTextDocument));

  // Parse each file
  parsedDocuments =
    textDocuments.map(parseTextDocument)
      .filter(chunk => !!chunk)
    // Put the result into a map for lookup by file uri
      .reduce((dict, curr) => {
        dict.set(curr!.textDocument.uri, curr!);
        return dict;
      }, new Map<string, { textDocument: TextDocument, chunk: Chunk }>());

  rebuildProjectTree();

  // Now we have the project tree, we can FINALLY finish parsing all the files.
  findDefUsagesForAllProjects();
}

async function getFilesRecursive(folderPath: string): Promise<string[]> {
  const p8andLuaFiles: string[] = [];
  try {
    const files = await fs.promises.readdir(folderPath);

    await Promise.all(files.map(async file => {
      const filePath = path.join(folderPath, file);

      const stat = await fs.promises.lstat(filePath);
      if (stat.isDirectory() && !file.startsWith('.')) {
        p8andLuaFiles.push(...(await getFilesRecursive(filePath)));
      } else if (stat.isFile() && (/\.(p8|lua)$/i.exec(filePath))) {
        p8andLuaFiles.push(filePath);
      }
    }));

  } catch (e) {
    console.error('Error when scanning workspace folder ' + folderPath, e);
  }

  return p8andLuaFiles;
}

async function createTextDocument(filePath: string) {
  const uri = url.pathToFileURL(filePath).toString();

  const cached = documents.get(uri);
  if (cached) {
    return cached;
  }

  const languageId = filePath.endsWith('p8') ? 'pico-8' : 'pico-8-lua';
  const content = (await fs.promises.readFile(filePath)).toString();
  const result = TextDocument.create(uri, languageId, 0, content);
  return result;
}

function rebuildProjectTree() {
  // Figure out which files belong together in a "project"
  projects = findProjects(parsedDocuments);

  // Build the map of filenames -> projects
  projectsByFilename = new Map();
  const iterateNode = (projNode: ProjectDocumentNode, rootProject: Project) => {
    projectsByFilename.set(projNode.document.textDocument.uri, rootProject);
    for (const child of projNode.included) {
      iterateNode(child, rootProject);
    }
  };
  for (const project of projects) {
    iterateNode(project.root, project);
  }
}

function findDefUsagesForAllProjects() {
  // How this works is that the root of the project #includes all the other
  // files into itself, so its global scope has everything all the other files
  // might want. So we just invoke DefinitionsUsagesFinder on every file,
  // injecting the global scope of the root file into the other files.
  projects.forEach(findDefUsagesForProject);
}

function findDefUsagesForProject(project: Project) {
  // Before we start, make sure we're using the most up-to-date version of the files
  refreshProject(project);

  const rootScope = processDefUsages(project.root.document);
  if (!rootScope) {
    return;
  }

  // recursive stepping through includes in case the includes have includes
  const iterateNode = (projNode: ProjectDocumentNode) => {
    processDefUsages(projNode.document, rootScope);
    // recurse into children
    for (const child of projNode.included) {
      iterateNode(child);
    }
  };

  // actually iterate over the children of the root
  for (const child of project.root.included) {
    iterateNode(child);
  }
}

// Refresh the contents of each parsed file in the project tree
// by fetching the document & parsed AST from parsedDocuments.
function refreshProject(project: Project) {
  iterateProject(project, refreshNodeContents);
}

function refreshNodeContents(node: ProjectDocumentNode) {
  const parsed = parsedDocuments.get(node.document.textDocument.uri);
  if (!parsed) {
    console.log('refreshNodeContents: cannot find contents of file ' + node.document.textDocument.uri);
    return;
  }

  node.document = parsed;
}

function processDefUsages(document: ProjectDocument, injectedGlobalScope?: DefUsageScope) {
  try {
    const uri = document.textDocument.uri;
    const { warnings, definitionsUsages, scopes } = findDefinitionsUsages(document.chunk, false, injectedGlobalScope);

    // set some stuff in lookup tables
    documentDefUsage.set(uri, definitionsUsages);
    documentScopes.set(uri, scopes);

    // send diagnostics
    const diagnostics: Diagnostic[] = warnings.filter(w => inThisFile(uri, w)).map(w => toDiagnostic(w));
    connection.sendDiagnostics({ uri: uri, diagnostics });

    return scopes;
  } catch (e) {
    console.error(e);
  }
}

interface DocumentSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not
// supported by the client. Note that this isn't the case with VSCode but could
// happen with other clients.
const defaultSettings: DocumentSettings = { maxNumberOfProblems: 1000 };
let globalSettings: DocumentSettings = defaultSettings;

// Set up validation handler for when document changes
documents.onDidChangeContent(change => {
  const document = change.document;

  // re-parse the AST
  const parsed = parseTextDocument(document);
  if (!parsed) {
    console.log('Failed to parse ' + document.uri);
    return;
  }

  // Check if includes have changed -- if they have, we need to rebuild project files
  const includedUris = parsed.chunk.includes!.map(include => include.resolvedFile.fileURL).sort();

  // get the old includes to see what they were before
  const oldIncludes = parsedDocuments.get(document.uri);
  let oldIncludedUris = oldIncludes?.chunk.includes!.map(include => include.resolvedFile.fileURL).sort();
  oldIncludedUris = oldIncludedUris || [];

  // Before we proceed, we need to make sure to store the newly parsed doc back in parsedDocuments
  parsedDocuments.set(document.uri, parsed);

  // compare the two
  let foundProjectDifferences = includedUris.length !== oldIncludedUris.length;
  for (let i = 0; i < includedUris.length; i++) {
    if (includedUris[i] !== oldIncludedUris[i]) {
      foundProjectDifferences = true;
    }
  }

  if (foundProjectDifferences) {
    console.log('Found differences in #include statements -- rebuilding project tree');
    rebuildProjectTree();
    findDefUsagesForAllProjects();
  } else {
    // Otherwise, only re-scan the project that has changed
    const projectOfChangedFile = projectsByFilename.get(document.uri);
    projectOfChangedFile && reparseProjectFiles(projectOfChangedFile, { [document.uri]: parsed }).catch(e => {
      console.error('error reparsing project files: ', e);
    });
  }
});

async function reparseProjectFiles(project: Project, alreadyParsed: { [filename: string]: ProjectDocument }) {
  const projFiles = getProjectFiles(project);

  await Promise.all(projFiles.map(async file => {
    if (alreadyParsed[file]) {
      return;
    }

    const textDocument = await createTextDocument(url.fileURLToPath(file));
    const parsed = parseTextDocument(textDocument);
    if (parsed) {
      parsedDocuments.set(textDocument.uri, parsed);
    } else {
      console.error('error parsing', textDocument.uri);
    }
  }));

  findDefUsagesForProject(project);
}

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<DocumentSettings>> = new Map<string, Thenable<DocumentSettings>>();
// When a document is closed, purge its entry from the cache
documents.onDidClose(e => documentSettings.delete(e.document.uri));

// Text for open documents
const documentTextCache: Map<string, TextDocument> = new Map<string, TextDocument>();
// Symbols for open documents
const documentSymbols: Map<string, DocumentSymbol[]> = new Map<string, DocumentSymbol[]>();
// Definition/Usages lookup table for open documents
const documentDefUsage: Map<string, DefinitionsUsagesLookup> = new Map<string, DefinitionsUsagesLookup>();
// Scopes, for lookup up symbols for auto-completion
const documentScopes: Map<string, DefUsageScope> = new Map<string, DefUsageScope>();
// Includes, for looking up go-to-definition on the include statements themselves
const documentIncludes: Map<string, Include[]> = new Map<string, Include[]>();

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    // reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = change.settings['pico8-ls'] || defaultSettings;
  }

  rescanEverything();
});

function getDocumentSettings(resource: string): Thenable<DocumentSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }

  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'pico8-ls',
    });
    documentSettings.set(resource, result);
  }
  return result;
}

const symbolTypeLookup = {
  [CodeSymbolType.Function]: SymbolKind.Function,
  [CodeSymbolType.LocalVariable]: SymbolKind.Variable,
  // Obviously a global variable is not a class, but we use it since it has a nicer symbol
  [CodeSymbolType.GlobalVariable]: SymbolKind.Class,
};

function boundsToRange(textDocument: TextDocument, bounds: Bounds): Range {
  return {
    start: textDocument.positionAt(bounds.start.index),
    end: textDocument.positionAt(bounds.end.index),
  };
}

function toDocumentSymbol(textDocument: TextDocument, symbol: CodeSymbol): DocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: symbolTypeLookup[symbol.type],
    range: boundsToRange(textDocument, symbol.loc),
    selectionRange: boundsToRange(textDocument, symbol.selectionLoc),
    children: symbol.children.map(child => toDocumentSymbol(textDocument, child)),
  };
}

function inThisFile(documentUri: string, err: ParseError | Warning): boolean {
  const fileURI = err.bounds.start.filename.fileURL;
  if (documentUri === fileURI) {
    return true;
  } else {
    // console.error(`Filtering warning (ideally this shouldn't happen) because it's for file ${fileURI} instead of file ${textDocument.uri}:`, err);
    return false;
  }
}

function toDiagnostic(err: ParseError | Warning): Diagnostic {
  return {
    message: err.message,
    range: {
      start: { line: err.bounds.start.line - 1, character: err.bounds.start.column },
      end: { line: err.bounds.end.line - 1, character: err.bounds.end.column },
    },
    severity: err.type === 'ParseError' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
    source: 'PICO-8 LS',
  };
}

const fileResolver: FileResolver = {
  doesFileExist: (filepath) => fs.existsSync(filepath),
  isFile: (filepath) => fs.lstatSync(filepath).isFile(),
  loadFileContents: (filepath) => {
    const uri = url.pathToFileURL(filepath).toString();

    const cached = documents.get(uri);
    if (cached) {
      return cached.getText();
    }

    // file isn't available in documents cache so read it the old-fashioned way
    return fs.readFileSync(filepath).toString();
  },
};

function parseTextDocument(textDocument: TextDocument) {
  try {
    // parse document
    const text = textDocument.getText();
    documentTextCache.set(textDocument.uri, textDocument);
    const parser = new Parser(ResolvedFile.fromFileURL(textDocument.uri), text, fileResolver);
    const chunk = parser.parse();
    const { errors, symbols, includes } = chunk;

    // Set document info in caches
    const symbolInfo: DocumentSymbol[] = symbols.map(sym => toDocumentSymbol(textDocument, sym));
    documentSymbols.set(textDocument.uri, symbolInfo);
    documentIncludes.set(textDocument.uri, includes!);

    // send errors back to client immediately
    const diagnostics = errors.filter(e => inThisFile(textDocument.uri, e)).map(e => toDiagnostic(e));
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });

    return { textDocument, chunk };
  } catch(e) {
    console.error(e);
    return undefined;
  }
}

connection.onDocumentSymbol((params: DocumentSymbolParams) => {
  return documentSymbols.get(params.textDocument.uri);
});

function getDefinitionsUsagesForPosition(params: TextDocumentPositionParams): DefinitionsUsages | undefined {
  const lookup = documentDefUsage.get(params.textDocument.uri);
  if (!lookup) {
    console.log('Definition/usages lookup table unavailable for ' + params.textDocument.uri);
    return undefined;
  }

  return lookup.lookup(
    // They use 0-index line numbers, we use 1-index
    params.position.line + 1,
    params.position.character);
}

function boundsToLocation(bounds: Bounds): Location {
  return {
    uri: bounds.start.filename.fileURL,
    range: {
      start: { line: bounds.start.line - 1, character: bounds.start.column },
      end: { line: bounds.end.line - 1, character: bounds.end.column },
    },
  };
}

connection.onDefinition((params: DefinitionParams) => {
  const includes = documentIncludes.get(params.textDocument.uri);
  if (includes) {
    // They use 0-index line numbers, we use 1-index
    const line = params.position.line + 1;
    const column = params.position.character;

    for (const include of includes) {
      const loc = include.stmt.loc!;
      if (line === loc.start.line && column >= loc.start.column && column <= loc.end.column) {
        const ret: Location = {
          uri: include.resolvedFile.fileURL,
          // We're just linking to the entire included file, so the range is the whole thing
          range: {
            start: { line: 0, character: 0 },
            end: { line: Number.MAX_SAFE_INTEGER, character: 0 },
          },
        };
        return [ ret ];
      }
    }
  }

  const result = getDefinitionsUsagesForPosition(params);
  if (!result) {
    return [];
  }

  return result.definitions.map(bounds => boundsToLocation(bounds));
});

connection.onReferences((params: ReferenceParams) => {
  const result = getDefinitionsUsagesForPosition(params);
  if (!result) {
    return [];
  }

  return result.usages.map(bounds => boundsToLocation(bounds));
});

connection.onDidChangeWatchedFiles(_change => {
  // Monitored files have change in VS Code
  connection.console.log('We received a file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const scopes = documentScopes.get(params.textDocument.uri);
  if (!scopes) {
    console.log('Definition/usages lookup table unavailable for ' + params.textDocument.uri);
    return [];
  }

  return scopes.lookupScopeFor({
    // They use 0-index line numbers, we use 1-index
    line: params.position.line + 1,
    column: params.position.character,
    // index is 0 because it is unused in the lookup (TODO fixme)
    index: 0,
    filename: ResolvedFile.fromFileURL(params.textDocument.uri) })
    .allSymbols()
    .map(sym => {
      return { label: sym };
    });
});

function toDocumentationMarkdown(name: string, info: BuiltinFunctionInfo) : string {
  if (!info.sig) {
    return '';
  }

  return `## ${name}

\`${info.sig}\`

${info.desc}

### Params:
${info.params?.map(p => ` - ${p}`).join('\n')}`;
}

connection.onCompletionResolve((item: CompletionItem) => {
  const name = item.label;

  const info = Builtins[name];
  if (info) {
    item.detail = info.sig;
    item.documentation = {
      kind: 'markdown',
      value: toDocumentationMarkdown(name, info),
    };
    if (info.deprecated) {
      item.tags = [ CompletionItemTag.Deprecated ];
    }
  }

  return item;
});

function identifierAtPosition(position: number, text: string) {
  let i;
  for (i = position; i >= 0; i--) {
    if (!isIdentifierPart(text.charCodeAt(i))) {
      i++;
      break;
    }
  }
  const begin = i;

  for (i = position; i < text.length; i++) {
    if (!isIdentifierPart(text.charCodeAt(i))) {
      break;
    }

  }
  const end = i;

  return text.substring(begin, end);
}

function getTextOnLine(textDocumentUri: string, position: Position): string | undefined {
  const text = documentTextCache.get(textDocumentUri);
  if (!text) {
    return undefined;
  }

  return text.getText({
    start: Position.create(position.line, 0),
    end: Position.create(position.line, Number.MAX_VALUE),
  });
}

connection.onHover((params: HoverParams) => {
  const textOnLine = getTextOnLine(params.textDocument.uri, params.position);
  if (!textOnLine) {
    return undefined;
  }
  const identifier = identifierAtPosition(params.position.character, textOnLine);

  const info = Builtins[identifier];
  if (info) {
    return {
      contents: toDocumentationMarkdown(identifier, info),
    };
  }
});

connection.onSignatureHelp((params: SignatureHelpParams) => {
  const textOnLine = getTextOnLine(params.textDocument.uri, params.position);
  if (!textOnLine) {
    return undefined;
  }

  // get position of starting (
  let i = params.position.character;
  let numCommas = 0;
  while (i >= 0 && textOnLine[i] !== '(') {
    if (textOnLine[i] === ',') {
      numCommas++;
    }
    i--;
  }

  // not found
  if (i < 0) {
    return undefined;
  }

  const startingParenPos = i;

  // get identifier before that
  const identifier = identifierAtPosition(startingParenPos - 1, textOnLine);
  const info = Builtins[identifier];
  if (!info || !info.sig || !info.params) {
    return undefined;
  }

  const signatureInfo: SignatureInformation = {
    label: info.sig,
    documentation: {
      kind: 'markdown',
      value: toDocumentationMarkdown(identifier, info),
    },
    activeParameter: numCommas,
    parameters: info.params.map(p => {
      const idxOfColon = p.indexOf(':');
      return {
        label: p.substring(0, idxOfColon),
        documentation: p,
      };
    }),
  };

  return {
    signatures: [ signatureInfo ],
    activeSignature: 0,
    activeParameter: numCommas,
  };
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

console.log('PICO-8 Language Server launched.');
