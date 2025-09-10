import { deepEquals, parse } from './test-utils';
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
});

