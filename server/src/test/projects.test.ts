import { strictEqual as eq } from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import ResolvedFile from '../parser/file-resolver';
import { deepEquals } from '../parser/test/test-utils';
import { findProjects, ParsedDocumentsMap, ProjectDocument } from '../projects';

// Creates a mock ProjectDocument that just has the specified includes
function mockTextDocument(name: string, includes: string[]): ProjectDocument {
  return {
    textDocument: TextDocument.create(name, 'pico-8-lua', 0, 'test file contents'),
    chunk: {
      block: {
        type: 'Block',
        body: [],
      },
      errors: [],
      symbols: [],
      type: 'Chunk',
      includes: includes.map(filename => {
        return {
          resolvedFile: new ResolvedFile(filename, filename),
          stmt: {
            type: 'IncludeStatement',
            filename,
          },
        };
      }),
    },
  };
}

function createDocumentsMap(docs: ProjectDocument[]): ParsedDocumentsMap {
  const map = new Map<string, ProjectDocument>();

  for (const doc of docs) {
    map.set(doc.textDocument.uri, doc);
  }

  return map;
}

describe('findProjects', () => {
  it('groups files that include each other into projects', () => {
    const root = mockTextDocument('root.p8', [ 'lib1.lua', 'lib2.lua' ]);
    const lib1 = mockTextDocument('lib1.lua', [ 'nested.lua' ]);
    const lib2 = mockTextDocument('lib2.lua', []);
    const nested = mockTextDocument('nested.lua', []);
    const separate = mockTextDocument('separate.p8', []);

    const docs = createDocumentsMap([ root, lib1, lib2, nested, separate ]);
    const projects = findProjects(docs);

    eq(projects.length, 2);

    const rootProj = projects.find(p => p.root.document.textDocument.uri === 'root.p8');
    deepEquals(rootProj, {
      root: {
        isChild: false,
        document: { textDocument: { uri: 'root.p8' } },
        included: [
          {
            isChild: true,
            document: { textDocument: { uri: 'lib1.lua' } },
            included: [
              { isChild: true, document: { textDocument: { uri: 'nested.lua' } }, included: [] },
            ],
          },
          { isChild: true, document: { textDocument: { uri: 'lib2.lua' } }, included: [] },
        ],
      },
    });

    const separateProj = projects.find(p => p.root.document.textDocument.uri === 'separate.p8');
    deepEquals(separateProj, {
      root: {
        isChild: false, document: { textDocument: { uri: 'separate.p8' } }, included: [],
      },
    });
  });
});
