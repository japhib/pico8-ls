import * as path from 'path';
import { ExtensionContext, languages, workspace } from 'vscode';
import { CloseAction, ErrorAction, LanguageClient, LanguageClientOptions, Message, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import SemanticTokenProvider, { legend } from './semantic-token-provider';

export function activate(context: ExtensionContext): void {
  languages.registerDocumentSemanticTokensProvider(
    { language: 'pico-8', scheme: 'file' },
    SemanticTokenProvider,
    legend,
  );

  languages.registerDocumentSemanticTokensProvider(
    { language: 'pico-8-lua', scheme: 'file' },
    SemanticTokenProvider,
    legend,
  );

  const client = new LanguageClient(
    'pico8-ls',
    'PICO-8 LS',
    getServerOptions(context),
    getClientOptions(),
  );

  // starts both client and server
  const disposable = client.start();

  // So the client gets deactivated on extension deactivation
  context.subscriptions.push(disposable);
}

// Get options for running Node language server
function getServerOptions(context: ExtensionContext): ServerOptions {
  const serverModule = context.asAbsolutePath(path.join('server', 'out-min', 'main.js'));

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
    documentSelector: [
      { scheme: 'file', language: 'pico-8' },
      { scheme: 'file', language: 'pico-8-lua' },
    ],
    synchronize: {
      // Notify the server about file changes to .pico8ls files in the workspace
      // (we'll use that file for config later on)
      fileEvents: workspace.createFileSystemWatcher('**/.pico8ls'),
    },

    errorHandler: {
      error(error: Error, message: Message | undefined, count: number | undefined): ErrorAction {
        console.log('there has been an error!!', error, message, count);
        return ErrorAction.Continue;
      },
      closed(): CloseAction {
        return CloseAction.Restart;
      },
    },
  };
}
