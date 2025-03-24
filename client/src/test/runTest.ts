// Docs on testing a VSCode extension:
// https://code.visualstudio.com/api/working-with-extensions/testing-extension

import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    const testWorkspacePath = path.resolve(__dirname, '../../src/test/test-workspace');

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        // open our test workspace
        testWorkspacePath,
        // disable all other extensions
        '--disable-extensions',
        // use a new, temporary user profile
        '--profile-temp'
      ]
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
