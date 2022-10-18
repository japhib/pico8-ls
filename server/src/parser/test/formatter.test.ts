import { deepEquals, getTestFileContents, parse } from './test-utils';
import { strictEqual as eq } from 'assert';
import Formatter from '../formatter';
import { Statement } from '../statements';

function format(text: string): string {
  const chunk = parse(text);
  const formatter = new Formatter();
  return formatter.formatChunk(chunk);
}

function insertComments(text: string): Statement[] {
  const chunk = parse(text);
  const formatter = new Formatter();
  formatter.insertComments(chunk);
  return chunk.body;
}

describe('Formatter', () => {
  describe('Formats entire files', () => {
    // TODO: write proper tests for the final implementation
    it.skip('formats low.p8', () => {
      const formatted = format(getTestFileContents('low.p8'));
      console.log(formatted);
    });

    it.skip('formats low.lua', () => {
      const formatted = format(getTestFileContents('low.lua'));
      console.log(formatted);
    });
  });

  describe('Formats specific types of statements', () => {
    it('formats for loop', () => {
      const input = '	for i=0,29 do add(got_fruit,false) end';
      const formatted = format(input);
      eq(formatted, `
for i = 0, 29 do
  add(got_fruit, false)
end
        `.trim());
    });

    it('leaves comments in', () => {
      const input = `
-- this is my variable
local a = 1
        `.trim();
      const formatted = format(input);
      // should leave it the same
      eq(formatted, input);
    });

    it('properly formats unary expressions', () => {
      const input = `
a = not a
a = #a
a = -a
        `.trim();
      const formatted = format(input);
      eq(formatted, `
a = not a
a = #a
a = -a
        `.trim());
    });

    it.skip('doesn\'t inline #include statements', () => {
      // TODO
    });

    it('handles local statements even without initializer', () => {
      const input = 'local a';
      const formatted = format(input);
      eq(formatted, 'local a');
    });

    it('preserves local keyword used for a function declaration', () => {
      const input = `
local function some_fn()
end
        `.trim();
      const formatted = format(input);
      eq(formatted, `
local function some_fn()
end
        `.trim());
    });

    it('preserves parentheses when a their inner expression is called as a function', () => {
      const input = `
(fn1 or fn_2)()
        `.trim();
      const formatted = format(input);
      eq(formatted, `
(fn1 or fn_2)()
        `.trim());
    });

    it('preserves parentheses when a property is called on their inner expression', () => {
      const input = `
(table1 or table2).some_property()
        `.trim();
      const formatted = format(input);
      eq(formatted, `
(table1 or table2).some_property()
        `.trim());
    });

    it('preserves parentheses when a property is accessed by value on their inner expression', () => {
      const input = `
local result = ({
  [123] = "xyz"
})[123]
        `.trim();
      const formatted = format(input);
      // TODO: ideally we would assert presence of parentheses, while ignoring if new lines are there or not, since they are not a subject of this test
      eq(formatted, `
local result = ({[123] = "xyz"})[123]
        `.trim());
    });
  });

  it('preserves parentheses on calculations', () => {
    const input = `
a = 1 - (t-1)^2
b = (some_var_1 - 111 * 222) / 333
c = (some_var_2 - 111) * 222
d = (some_var_3 + 111) % 222
e = some_table.some_fn(
  some_var_4 * (rnd() - .5),
  some_var_5 * (rnd() - .5)
)
        `.trim();
    const formatted = format(input);
    // TODO: ideally we would assert presence of parentheses, while ignoring if new lines are there or not, since they are not a subject of this test
    eq(formatted, `
a = 1 - (t - 1)^2
b = (some_var_1 - 111 * 222) / 333
c = (some_var_2 - 111) * 222
d = (some_var_3 + 111) % 222
e = some_table.some_fn(some_var_4 * (rnd() - .5), some_var_5 * (rnd() - .5))
        `.trim());
  });

  // TODO change these tests into actual formatting tests
  // rather than relying on inspecting the AST
  describe('Edits AST before formatting', () => {
    it('inserts comments before local statement', () => {
      const input = `
-- this is my variable
local a = 1
        `.trim();
      const ast = insertComments(input);
      deepEquals(ast, [
        { type: 'Comment', value: ' this is my variable' },
        { type: 'LocalStatement' },
      ]);
    });

    it('inserts multi-line comments before local statement', () => {
      const input = `
--[[ this is my 
 long-winded 
variable]]
local a = 1
        `.trim();
      const ast = insertComments(input);
      deepEquals(ast, [
        { type: 'Comment', value: ' this is my \n long-winded \nvariable' },
        { type: 'LocalStatement' },
      ]);
    });

    it('inserts comments in between statements', () => {
      const input = `
-- First comment
local a
-- Second comment
local b
-- Third comment
local c
-- Last comment
        `.trim();
      const ast = insertComments(input);
      deepEquals(ast, [
        { type: 'Comment', value: ' First comment' },
        { type: 'LocalStatement' },
        { type: 'Comment', value: ' Second comment' },
        { type: 'LocalStatement' },
        { type: 'Comment', value: ' Third comment' },
        { type: 'LocalStatement' },
        { type: 'Comment', value: ' Last comment' },
      ]);
    });

    it('inserts multiple line comments in between statements', () => {
      const input = `
-- comment 1a
-- comment 1b
local a
-- comment 2a
-- comment 2b
local b
-- comment 3a
-- comment 3b
        `.trim();
      const ast = insertComments(input);
      deepEquals(ast, [
        { type: 'Comment', value: ' comment 1a' },
        { type: 'Comment', value: ' comment 1b' },
        { type: 'LocalStatement' },
        { type: 'Comment', value: ' comment 2a' },
        { type: 'Comment', value: ' comment 2b' },
        { type: 'LocalStatement' },
        { type: 'Comment', value: ' comment 3a' },
        { type: 'Comment', value: ' comment 3b' },
      ]);
    });

    it('inserts multi-line comments in between statements', () => {
      const input = `
--[[ comment 1a
 comment 1b]]
local a
--[[ comment 2a
 comment 2b]]
local b
--[[ comment 3a
 comment 3b]]
        `.trim();
      const ast = insertComments(input);
      deepEquals(ast, [
        { type: 'Comment', value: ' comment 1a\n comment 1b' },
        { type: 'LocalStatement' },
        { type: 'Comment', value: ' comment 2a\n comment 2b' },
        { type: 'LocalStatement' },
        { type: 'Comment', value: ' comment 3a\n comment 3b' },
      ]);
    });

    it('Inserts comments into block statements', () => {
      const input = `
-- about to enter for loop
for i=1,10 do
  -- this is where we loop
  print(i)
end
        `.trim();
      const ast = insertComments(input);
      deepEquals(ast, [
        { type: 'Comment', value: ' about to enter for loop' },
        {
          type: 'ForNumericStatement',
          body: [
            { type: 'Comment', value: ' this is where we loop' },
            { type: 'CallStatement' },
          ],
        },
      ]);
    });

    it('inserts comments into the various clauses of an "if" statement', () => {
      const input = `
-- main comment
if a < 1 then
  -- if clause
  print('a')
elseif a == 1 then
  -- elseif clause
  print('b')
else
  -- else clause
  print('c')
end
-- end comment
        `.trim();
      const ast = insertComments(input);
      deepEquals(ast, [
        { type: 'Comment', raw: '-- main comment' },
        {
          type: 'IfStatement',
          oneLine: false,
          clauses: [
            {
              type: 'IfClause',
              body: [
                { type: 'Comment', raw: '-- if clause' },
                { type: 'CallStatement' },
              ],
            },
            {
              type: 'ElseifClause',
              body: [
                { type: 'Comment', raw: '-- elseif clause' },
                { type: 'CallStatement' },
              ],
            },
            {
              type: 'ElseClause',
              body: [
                { type: 'Comment', raw: '-- else clause' },
                { type: 'CallStatement' },
              ],
            },
          ],
        },
        { type: 'Comment', raw: '-- end comment' },
      ]);
    });
  });
});
