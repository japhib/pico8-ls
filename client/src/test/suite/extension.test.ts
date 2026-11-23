import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as sinon from 'sinon';
import { LanguageClient } from 'vscode-languageclient/node';
import EventEmitter from 'events';
import { createLanguageClient } from '../../extension';

const testWorkspacePath = path.resolve(__dirname, '../../../src/test/test-workspace');

async function openDoc(...paths: string[]) {
  const uri = vscode.Uri.file(path.resolve(...paths));
  const doc = await vscode.workspace.openTextDocument(uri);
  return { uri, doc };
}

function findPosition(doc: vscode.TextDocument, toFind: string, offset?: number): vscode.Position {
  offset = offset ?? 0;

  const text = doc.getText();

  const idx = text.indexOf(toFind);
  if (idx === -1) {
    throw new Error(`Can't find position of text '${toFind}' in document ${doc.uri}`);
  }

  return doc.positionAt(idx + offset);
}

// FakeOutputChannel is a fake output channel used to buffer
// the output of the tested language client in an in-memory
// string array until cleared.
class FakeOutputChannel implements vscode.OutputChannel {
	name = 'FakeOutputChannel';
	show = sinon.fake();
	hide = sinon.fake();
	dispose = sinon.fake();
	replace = sinon.fake();

	private buf = [] as string[];

	private eventEmitter = new EventEmitter();
	private registeredPatterns = new Set<string>();
	onPattern(msg: string, listener: () => void) {
		this.registeredPatterns.add(msg);
		this.eventEmitter.once(msg, () => {
			this.registeredPatterns.delete(msg);
			listener();
		});
	}

	append = (v: string) => this.enqueue(v);
	appendLine = (v: string) => this.enqueue(v);
	clear = () => {
		this.buf = [];
	};
	toString = () => {
		return this.buf.join('\n');
	};

	private enqueue = (v: string) => {
		this.registeredPatterns?.forEach((p) => {
			if (v.includes(p)) {
				this.eventEmitter.emit(p);
			}
		});

		if (this.buf.length > 1024) {
			this.buf.shift();
		}
		this.buf.push(v.trim());
	};
}

// Env is a collection of test-related variables and lsp client.
// Currently, this works only in module-aware mode.
class Env {
	public languageClient?: LanguageClient;
	private fakeOutputChannel?: FakeOutputChannel;
	private disposables = [] as { dispose(): any }[];

	public flushTrace(print: boolean) {
		if (print) {
			console.log(this.fakeOutputChannel?.toString());
		}
		this.fakeOutputChannel?.clear();
	}

	// This is a hack to check the progress of package loading.
	// TODO(hyangah): use progress message middleware hook instead
	// once it becomes available.
	public onMessageInTrace(msg: string, timeoutMS: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.flushTrace(true);
				reject(`Timed out while waiting for '${msg}'`);
			}, timeoutMS);
			this.fakeOutputChannel?.onPattern(msg, () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	}

	// Start the language server with the fakeOutputChannel.
	public async startLanguageClient(filePath: string, config?: vscode.WorkspaceConfiguration) {
		// file path to open.
		this.fakeOutputChannel = new FakeOutputChannel();
		const pkgLoadingDone = this.onMessageInTrace('Finished loading packages.', 60_000);

		this.languageClient = createLanguageClient({
      outputChannel: this.fakeOutputChannel,
      overrideServerPath: path.resolve(__dirname, '../../../../server/out/server.js')
    });
		if (!this.languageClient) {
			throw new Error('Language client not initialized.');
		}

		await this.languageClient.start();
		await this.openDoc(filePath);
		await pkgLoadingDone;
	}

	public async teardown() {
		try {
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			await this.languageClient?.stop(); // 1s timeout
		} catch (e) {
			console.log(`failed to stop gopls within 1sec: ${e}`);
		} finally {
			if (this.languageClient?Env.r) {
				console.log(`failed to stop language client on time: ${this.languageClient?.state}`);
				this.flushTrace(true);
			}
			for (const d of this.disposables) {
				d.dispose();
			}
			this.languageClient = undefined;
		}
	}

	public async openDoc(...paths: string[]) {
		const uri = vscode.Uri.file(path.resolve(...paths));
		const doc = await vscode.workspace.openTextDocument(uri);
		return { uri, doc };
	}
}

async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  // TODO how to handle putting back all the contents of the test file after the test is done?
  // TODO edit the document maybe with vscode.window.activeTextEditor.edit()
  // TODO trigger an auto-complete action and get possible auto-completions
  // TODO accept an auto-complete action for 'tb.property'
  // TODO assert on resulting contents of text document
  test('autocompletion of table member', async () => {
    const { uri, doc } = await openDoc(testWorkspacePath, 'table_autocomplete.p8');
    // const pos = findPosition(doc, 'tb.prop\n', 7);
    // console.log(pos.line, pos.character);

    const completionList = (await vscode.commands.executeCommand(
      'vscode.executeCompletionItemProvider',
      uri,
      new vscode.Position(7, 8)
    )) as vscode.CompletionList;

    // let txt = doc.getText(new vscode.Range(
    //   new vscode.Position(7, 0),
    //   new vscode.Position(7, 9),
    // ))
    // console.log(txt);

    // txt = doc.getText(new vscode.Range(
    //   new vscode.Position(7, 9),
    //   new vscode.Position(7, Number.MAX_SAFE_INTEGER),
    // ))
    // console.log(txt);

    if (!completionList) {
      assert.fail('no completion list!');
    }

    assert.ok(completionList.items.some(item => item.insertText === 'property'));
  });

  test.only('hover provider', async () => {
    const { uri, doc } = await openDoc(testWorkspacePath, 'hover_provider_test.lua');

    const hovers = (await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      uri,
      new vscode.Position(0, 2)
    )) as vscode.Hover[];

    assert.notDeepEqual(hovers, []);
  })
});
