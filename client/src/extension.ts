import * as path from 'path';
import { ExtensionContext, languages, workspace } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import SemanticTokenProvider, { legend } from './semantic-token-provider';

let client: LanguageClient;

export function activate(context: ExtensionContext): void {
  languages.registerDocumentSemanticTokensProvider(
    { language: 'pico-8', scheme: 'file' },
    SemanticTokenProvider,
    legend,
  );

  client = new LanguageClient(
    'pico8-ls',
    'PICO-8 LS',
    getServerOptions(context),
    getClientOptions(),
  );

  // starts both client and server
  client.start();
}

// Get options for running Node language server
function getServerOptions(context: ExtensionContext): ServerOptions {
  const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  const debugOptions = {
    execArgv: ['--nolazy', '--inspect=6009'],
  };

  // If the extension is launched in debug mode then the debug server options are used.
  // Otherwise the run options are used.
  return {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };
}

function getClientOptions(): LanguageClientOptions {
  return {
    // Register the server for PICO-8 documents
    documentSelector: [{ scheme: 'file', language: 'pico-8' }],
    synchronize: {
      // Notify the server about file changes to .pico8ls files in the workspace
      fileEvents: workspace.createFileSystemWatcher('**/.pico8ls'),
    },
  };
}

export function deactivate(): void | Promise<void> {
  // If the client has been started, stop it when the extension deactivates
  if (client) {
    return client.stop();
  }
}
