import * as path from 'path';
import { ExtensionContext, Position, Range, TextEdit, TextEditorEdit, commands, languages, window, workspace } from 'vscode';
import { CloseAction, ErrorAction, ExecuteCommandParams, LanguageClient, LanguageClientOptions, Message, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import SemanticTokenProvider, { legend } from './semantic-token-provider';

// Should stay in sync with FormatterOptions in server/src/parser/formatter.ts
type FormatterOptions = {
  // Size of a tab in spaces.
  tabSize: number,
  // Prefer spaces over tabs.
  insertSpaces: boolean,
  // Force each statement to be on a separate line.
  forceSeparateLines?: boolean,
};

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

  // register commands
  registerFormattingCommand(client, context, 'pico8formatFile', false);
  registerFormattingCommand(client, context, 'pico8formatFileSeparateLines', true);

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
    execArgv: [ '--nolazy', '--inspect=6009' ],
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
        console.log('There has been an error!', error, message, count);
        return ErrorAction.Continue;
      },
      closed(): CloseAction {
        return CloseAction.Restart;
      },
    },
  };
}

function registerFormattingCommand(client: LanguageClient, context: ExtensionContext, commandName: string, forceSeparateLines: boolean): void {
  const disposable = commands.registerCommand('extension.' + commandName, async () => {
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }

    const uri = editor.document.uri;

    const opts: FormatterOptions = {
      tabSize: Number(editor.options.tabSize) || 4,
      insertSpaces: !!editor.options.insertSpaces,
      forceSeparateLines: forceSeparateLines,
    };

    const params: ExecuteCommandParams = {
      command: commandName,
      arguments: [
        uri.toString(),
        opts,
      ],
    };

    const result: TextEdit = await client.sendRequest(
      'workspace/executeCommand',
      params,
    ) ;

    if (result.range && result.newText) {
      await editor.edit((editBuilder: TextEditorEdit) => {
        // Convert the plain object result.range into an instance of the vscode.Range class
        const editRange = new Range(new Position(result.range.start.line, result.range.start.character), new Position(result.range.end.line, result.range.end.character));
        editBuilder.replace(editRange, result.newText);
      });
    } else {
      void window.showErrorMessage('Invalid formatting result from language server backend. Please report an issue on GitHub.');
    }
  });
  context.subscriptions.push(disposable);
}
