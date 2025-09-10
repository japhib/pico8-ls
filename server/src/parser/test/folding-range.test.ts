import { deepEquals, parse, getTestFileContents } from './test-utils';
import { FoldingRangeVisitor } from '../folding-range-visitor';
import { FoldingRange } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getFoldingRegions } from '../folding-regions';

function getFoldingRanges(code: string): FoldingRange[] {
  const ast = parse(code);
  const visitor = new FoldingRangeVisitor();
  visitor.visit(ast);
  return visitor.ranges;
}

describe('Folding Ranges', () => {
  it('creates a folding range for an if statement', () => {
    const code = `
if (a) then
  print(a)
end
`.trim();
    const ranges = getFoldingRanges(code);
    deepEquals(ranges, [
      { startLine: 0, endLine: 1 },
    ]);
  });

  it('creates folding ranges for an if/elseif/else statement', () => {
    const code = `
if c1 then
  print(1)
elseif c2 then
  print(2)
else
  print(3)
end
`.trim();
    const ranges = getFoldingRanges(code);
    deepEquals(ranges, [
      { startLine: 0, endLine: 1 },
      { startLine: 2, endLine: 3 },
      { startLine: 4, endLine: 5 },
    ]);
  });

  it('creates a folding range for a while statement', () => {
    const code = `
while true do
  print(a)
end
`.trim();
    const ranges = getFoldingRanges(code);
    deepEquals(ranges, [
      { startLine: 0, endLine: 2 },
    ]);
  });

  it('creates a folding range for a do statement', () => {
    const code = `
do
  print(a)
end
`.trim();
    const ranges = getFoldingRanges(code);
    deepEquals(ranges, [
      { startLine: 0, endLine: 2 },
    ]);
  });

  it('creates a folding range for a repeat statement', () => {
    const code = `
repeat
  print(a)
until true
`.trim();
    const ranges = getFoldingRanges(code);
    deepEquals(ranges, [
      { startLine: 0, endLine: 2 },
    ]);
  });

  it('creates a folding range for a for numeric statement', () => {
    const code = `
for i=1,10 do
  print(i)
end
`.trim();
    const ranges = getFoldingRanges(code);
    deepEquals(ranges, [
      { startLine: 0, endLine: 2 },
    ]);
  });

  it('creates a folding range for a for generic statement', () => {
    const code = `
for k,v in pairs(t) do
  print(k,v)
end
`.trim();
    const ranges = getFoldingRanges(code);
    deepEquals(ranges, [
      { startLine: 0, endLine: 2 },
    ]);
  });

  it('creates a folding range for a function declaration', () => {
    const code = `
function my_func(a, b)
  return a+b
end
`.trim();
    const ranges = getFoldingRanges(code);
    deepEquals(ranges, [
      { startLine: 0, endLine: 2 },
    ]);
  });

  it('creates folding ranges for nested blocks', () => {
    const code = `
function my_func()
  if true then
    while true do
      print("hello")
    end
  end
end
`.trim();
    const ranges = getFoldingRanges(code);
    deepEquals(ranges, [
      { startLine: 0, endLine: 6 },
      { startLine: 1, endLine: 4 },
      { startLine: 2, endLine: 4 },
    ]);
  });

  it('does not create folding ranges for single line blocks', () => {
    const code = 'if true then print("hello") end';
    const ranges = getFoldingRanges(code);
    deepEquals(ranges, []);
  });

  it('creates folding ranges for blocks indented with tabs', () => {
    const code = `
if true then
	if true then
		print("hello")
	end
end
`.trim();
    const ranges = getFoldingRanges(code);
    deepEquals(ranges, [
      { startLine: 0, endLine: 3 },
      { startLine: 1, endLine: 2 },
    ]);
  });
});

describe('Folding Ranges (PICO-8)', () => {
  it('should create folding regions for -->8 tabs', () => {
    const code = `
__lua__
-- tab 1
function a() end
-->8
-- tab 2
function b() end
-->8
-- tab 3
function c() end
__gfx__
`;
    const textDocument = TextDocument.create('test.p8', 'pico-8', 0, code);
    const { comments } = parse(code);
    const regions = getFoldingRegions(textDocument, comments || []);

    deepEquals(regions, [
      { name: '0: tab 1', startLine: 2, endLine: 3 },
      { name: '1: tab 2', startLine: 5, endLine: 6 },
      { name: '2: tab 3', startLine: 8, endLine: 10 },
    ]);
  });

  it('should create folding regions for tabs.p8 using TestFilesResolver', () => {
    const filename = 'tabs.p8';
    const code = getTestFileContents(filename);
    const textDocument = TextDocument.create(filename, 'pico-8', 0, code);
    const { comments } = parse(code);

    const expectedFoldingRanges: FoldingRange[] = [
      { startLine: 3, endLine: 32 },   // tab 0: __lua__ ... -->8
      { startLine: 5, endLine: 7 },    // function _init()
      { startLine: 9, endLine: 11 },   // function _update()
      { startLine: 13, endLine: 27 },  // function _draw()
      { startLine: 16, endLine: 17 },  // if draw_tab == 0 then
      { startLine: 18, endLine: 19 },  // elseif draw_tab == 1 then
      { startLine: 20, endLine: 21 },  // elseif draw_tab == 2 then
      { startLine: 22, endLine: 23 },  // elseif draw_tab == 3 then
      { startLine: 24, endLine: 25 },  // elseif draw_tab == 4 then
      { startLine: 29, endLine: 32 },  // function draw_0()
      { startLine: 34, endLine: 39 },  // tab 1: -->8 ... -->8
      { startLine: 36, endLine: 39 },  // function draw_1()
      { startLine: 41, endLine: 48 },  // tab 2: -->8 ... -->8
      { startLine: 45, endLine: 48 },  // function draw_2()
      { startLine: 50, endLine: 54 },  // tab 3: -->8 ... -->8
      { startLine: 51, endLine: 54 },  // function draw_3()
      { startLine: 56, endLine: 63 },  // tab 4: -->8 ... __gfx__
      { startLine: 58, endLine: 61 },  // function draw_4()
    ];

    const regions = getFoldingRegions(textDocument, comments || []);
    const luaRanges = getFoldingRanges(code);

    const combinedRanges = [ ...regions, ...luaRanges ];

    // Sort the combined ranges for consistent comparison
    combinedRanges.sort((a, b) => {
      if (a.startLine !== b.startLine) {
        return a.startLine - b.startLine;
      }
      return a.endLine - b.endLine;
    });

    // Filter out regions that are not of type FoldingRange (e.g., PICO-8 tab regions)
    // and only compare startLine and endLine.
    const actualFoldingRanges = combinedRanges
      .filter(r => r.startLine !== undefined && r.endLine !== undefined)
      .map(r => ({ startLine: r.startLine, endLine: r.endLine }));

    deepEquals(actualFoldingRanges, expectedFoldingRanges);
  });
});
