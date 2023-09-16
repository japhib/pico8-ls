import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

import * as path from 'path';

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

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  // TODO how to handle putting back all the contents of the test file after the test is done?
  // TODO edit the document maybe with vscode.window.activeTextEditor.edit()
  // TODO trigger an auto-complete action and get possible auto-completions
  // TODO accept an auto-complete action for 'tb.property'
  // TODO assert on resulting contents of text document
  test('Can go-to definition on function', async () => {
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
});
