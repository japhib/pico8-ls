import {
  CompletionItem,
  createConnection,
  DefinitionParams,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  DocumentSymbol,
  DocumentSymbolParams,
  DocumentUri,
  InitializeParams,
  InitializeResult,
  Location,
  ProposedFeatures,
  Range,
  ReferenceParams,
  SymbolKind,
  TextDocumentPositionParams,
  TextDocuments,
  TextDocumentSyncKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from './parser/parser';
import { Bounds } from './parser/types';
import { CodeSymbolType, CodeSymbol } from './parser/symbols';
import { DefinitionsUsages, DefinitionsUsagesLookup } from './parser/definitions-usages';

console.log('Server starting.');

const connection = createConnection(ProposedFeatures.all);

const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

// Set up some initial configs
connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(capabilities.workspace && capabilities.workspace.configuration);
  hasWorkspaceFolderCapability = !!(capabilities.workspace && capabilities.workspace.workspaceFolders);
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // completionProvider: {
      //   triggerCharacters: ['.', ':'],
      //   resolveProvider: true,
      // },
      documentSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
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

// The example settings
interface DocumentSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: DocumentSettings = { maxNumberOfProblems: 1000 };
let globalSettings: DocumentSettings = defaultSettings;

// Set up validation handler for when document changes
documents.onDidChangeContent(change => validateTextDocument(change.document));

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<DocumentSettings>> = new Map<string, Thenable<DocumentSettings>>();
// When a document is closed, purge its entry from the cache
documents.onDidClose(e => documentSettings.delete(e.document.uri));

// Symbols for open documents
const documentSymbols: Map<string, DocumentSymbol[]> = new Map<string, DocumentSymbol[]>();
// Definition/Usages lookup table for open documents
const documentDefUsage: Map<string, DefinitionsUsagesLookup> = new Map<string, DefinitionsUsagesLookup>();

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    // reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = change.settings.languageServerExample || defaultSettings;
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
}

function boundsToRange(textDocument: TextDocument, bounds: Bounds): Range {
  return {
    start: textDocument.positionAt(bounds.start.index),
    end: textDocument.positionAt(bounds.end.index),
  }
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

async function validateTextDocument(textDocument: TextDocument) {
  const settings = await getDocumentSettings(textDocument.uri);

  // parse document
  const parser = new Parser(textDocument.getText());
  const { errors, symbols, definitionsUsages } = parser.parse();

  // set document symbols in cache
  const symbolInfo: DocumentSymbol[] = symbols.map(sym => toDocumentSymbol(textDocument, sym));
  documentSymbols.set(textDocument.uri, symbolInfo);

  // set document definitions/usages in cache
  documentDefUsage.set(textDocument.uri, definitionsUsages);

  // send errors back to client immediately
  const diagnostics: Diagnostic[] = errors.map(err => {
    return {
      message: err.message,
      range: {
        start: textDocument.positionAt(err.bounds.start.index),
        end: textDocument.positionAt(err.bounds.end.index),
      },
      severity: DiagnosticSeverity.Error,
      source: 'PICO-8 LS',
    };
  });

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
    }
  }
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
})

connection.onDidChangeWatchedFiles(_change => {
  // Monitored files have change in VS Code
  connection.console.log('We received a file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
  // The pass parameter contains the position of the text document in
  // which code complete got requested. For the example we ignore this
  // info and always provide the same completion items.
  return [];
});

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

console.log('Server launched.');
