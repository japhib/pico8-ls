import {
  CompletionItem,
  CompletionItemTag,
  createConnection,
  DefinitionParams,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  DocumentSymbol,
  DocumentSymbolParams,
  DocumentUri,
  HoverParams,
  InitializeParams,
  InitializeResult,
  Location,
  Position,
  ProposedFeatures,
  Range,
  ReferenceParams,
  SignatureHelpParams,
  SignatureInformation,
  SymbolKind,
  TextDocumentPositionParams,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from './parser/parser';
import { Bounds } from './parser/types';
import { CodeSymbolType, CodeSymbol } from './parser/symbols';
import { DefinitionsUsages, DefinitionsUsagesLookup, DefUsageScope } from './parser/definitions-usages';
import { ParseError, Warning } from './parser/errors';
import Builtins, { BuiltinFunctionInfo } from './parser/builtins';
import { isIdentifierPart } from './parser/lexer';

console.log('PICO-8 Language Server starting.');

const connection = createConnection(ProposedFeatures.all);

const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

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
      completionProvider: { triggerCharacters: ['.', ':'], resolveProvider: true },
      hoverProvider: true,
      signatureHelpProvider: { triggerCharacters: ['('], retriggerCharacters: [','] },
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
      connection.console.log('Workspace folder chagne event received: ' + JSON.stringify(event));
    });
  }
});

interface DocumentSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not
// supported by the client. Note that this isn't the case with VSCode but could
// happen with other clients.
const defaultSettings: DocumentSettings = { maxNumberOfProblems: 1000 };
let globalSettings: DocumentSettings = defaultSettings;

// Set up validation handler for when document changes
documents.onDidChangeContent(change => validateTextDocument(change.document));

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

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    // reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = change.settings['pico8-ls'] || defaultSettings;
  }

  // Revalidate all open text documents
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<DocumentSettings> {
  if (!hasConfigurationCapability)
    return Promise.resolve(globalSettings);

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

function toDiagnostic(textDocument: TextDocument, err: ParseError | Warning): Diagnostic {
  return {
    message: err.message,
    range: {
      start: textDocument.positionAt(err.bounds.start.index),
      end: textDocument.positionAt(err.bounds.end.index),
    },
    severity: err.type === 'ParseError' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
    source: 'PICO-8 LS',
  };
}

async function validateTextDocument(textDocument: TextDocument) {
  const settings = await getDocumentSettings(textDocument.uri);

  // parse document
  const text = textDocument.getText();
  documentTextCache.set(textDocument.uri, textDocument);
  const parser = new Parser(text);
  const { errors, warnings, symbols, definitionsUsages, scopes } = parser.parse();

  // Set document info in caches
  const symbolInfo: DocumentSymbol[] = symbols.map(sym => toDocumentSymbol(textDocument, sym));
  documentSymbols.set(textDocument.uri, symbolInfo);
  documentDefUsage.set(textDocument.uri, definitionsUsages);
  documentScopes.set(textDocument.uri, scopes!);

  // send errors back to client immediately
  const diagnostics: Diagnostic[] = [];
  const toDiagnosticBound = toDiagnostic.bind(null, textDocument);
  diagnostics.push(...errors.map(toDiagnosticBound));
  diagnostics.push(...warnings.map(toDiagnosticBound));
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
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

function boundsToLocation(uri: DocumentUri, bounds: Bounds): Location {
  return {
    uri,
    range: {
      start: { line: bounds.start.line - 1, character: bounds.start.column },
      end: { line: bounds.end.line - 1, character: bounds.end.column },
    },
  };
}

connection.onDefinition((params: DefinitionParams) => {
  const result = getDefinitionsUsagesForPosition(params);
  if (!result) return [];

  return result.definitions.map(bounds => boundsToLocation(params.textDocument.uri, bounds));
});

connection.onReferences((params: ReferenceParams) => {
  const result = getDefinitionsUsagesForPosition(params);
  if (!result) return [];

  return result.usages.map(bounds => boundsToLocation(params.textDocument.uri, bounds));
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
    index: 0 })
    .allSymbols()
    .map(sym => {
      return { label: sym };
    });
});

function toDocumentationMarkdown(name: string, info: BuiltinFunctionInfo) : string {
  if (!info.sig) return '';

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
    if (info.deprecated) item.tags = [CompletionItemTag.Deprecated];
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
    if (!isIdentifierPart(text.charCodeAt(i)))
      break;

  }
  const end = i;

  return text.substring(begin, end);
}

function getTextOnLine(textDocumentUri: string, position: Position): string | undefined {
  const text = documentTextCache.get(textDocumentUri);
  if (!text) return undefined;

  return text.getText({
    start: Position.create(position.line, 0),
    end: Position.create(position.line, Number.MAX_VALUE),
  });
}

connection.onHover((params: HoverParams) => {
  const textOnLine = getTextOnLine(params.textDocument.uri, params.position);
  if (!textOnLine) return undefined;
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
  if (!textOnLine) return undefined;

  // get position of starting (
  let i = params.position.character;
  let numCommas = 0;
  while (i >= 0 && textOnLine[i] !== '(') {
    if (textOnLine[i] === ',') numCommas++;
    i--;
  }

  // not found
  if (i < 0) return undefined;

  const startingParenPos = i;

  // get identifier before that
  const identifier = identifierAtPosition(startingParenPos - 1, textOnLine);
  const info = Builtins[identifier];
  if (!info || !info.sig || !info.params) return undefined;

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
    signatures: [signatureInfo],
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
