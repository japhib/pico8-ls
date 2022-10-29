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

// TODO: add a test for `opts = opts or {}` to not add parentheses around `{}`
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
        `.trim() + '\n');
    });

    it('preserves parentheses when their inner expression is called as a function', () => {
      const input = `
(fn1 or fn_2)()
        `.trim();
      const formatted = format(input);
      eq(formatted, `
(fn1 or fn_2)()
        `.trim());
    });

    it('preserves parentheses around function definition when called immediately', () => {
      const input = `
(function()
  do_something()
end)()
        `.trim();
      const formatted = format(input);
      eq(formatted, `
(function()
  do_something()
end)()
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

    it('preserves parentheses on calculations when they are required', () => {
      const input = `
a = some_var_1 - (some_var_2 - some_var_3)
b = some_var_1 / (some_var_2 / some_var_3)
c = 1 - (t - 1) ^ 2
d = (some_var_1 - 111 * 222) / 333
e = (some_var_2 - 111) * 222
f = (some_var_3 + 111) % 222
g = some_table.some_fn(
  some_var_4 * (rnd() - .5),
  some_var_5 * (rnd() - .5)
)
        `.trim();
      const formatted = format(input);
      // TODO: ideally we would assert presence of parentheses, while ignoring if new lines are there or not, since they are not a subject of this test
      eq(formatted, `
a = some_var_1 - (some_var_2 - some_var_3)
b = some_var_1 / (some_var_2 / some_var_3)
c = 1 - (t - 1) ^ 2
d = (some_var_1 - 111 * 222) / 333
e = (some_var_2 - 111) * 222
f = (some_var_3 + 111) % 222
g = some_table.some_fn(some_var_4 * (rnd() - .5), some_var_5 * (rnd() - .5))
        `.trim());
    });

    it('removes parentheses from calculations when they are unnecessary', () => {
      const input = `
a = some_var_1 + (some_var_2 + some_var_3)
b = some_var_1 * (some_var_2 * some_var_3)
c = (some_var_1 + some_var_2) + some_var_3
d = (some_var_1 * some_var_2) * some_var_3
e = (some_var_1 + some_var_2 + some_var_3)
f = (some_var_1) * some_var_2 * (some_var_3)
g = (some_var_1 - some_var_2) - some_var_3
h = (some_var_1 / some_var_2) / some_var_3
        `.trim();
      const formatted = format(input);
      // TODO: ideally we would assert presence of parentheses, while ignoring if new lines are there or not, since they are not a subject of this test
      eq(formatted, `
a = some_var_1 + some_var_2 + some_var_3
b = some_var_1 * some_var_2 * some_var_3
c = some_var_1 + some_var_2 + some_var_3
d = some_var_1 * some_var_2 * some_var_3
e = some_var_1 + some_var_2 + some_var_3
f = some_var_1 * some_var_2 * some_var_3
g = some_var_1 - some_var_2 - some_var_3
h = some_var_1 / some_var_2 / some_var_3
        `.trim());
    });
  });

  describe('Edits AST before formatting', () => {
    it('leaves comments before local statement', () => {
      const input = `
-- this is my variable
local a = 1`.trim();
      const output = format(input);
      eq(output, input);
    });

    it('leaves multi-line comments before local statement', () => {
      const input = `
--[[ this is my
 long-winded
variable]]
local a = 1`.trim();
      const output = format(input);
      eq(output, input);
    });

    it('leaves comments in between statements', () => {
      const input = `
-- First comment
local a
-- Second comment
local b
-- Third comment
local c
-- Last comment`.trim();
      const output = format(input);
      eq(output, input);
    });

    it('leaves multiple line comments in between statements', () => {
      const input = `
-- comment 1a
-- comment 1b
local a
-- comment 2a
-- comment 2b
local b
-- comment 3a
-- comment 3b`.trim();
      const output = format(input);
      eq(output, input);
    });

    it('leaves multi-line comments in between statements', () => {
      const input = `
--[[ comment 1a
 comment 1b]]
local a
--[[ comment 2a
 comment 2b]]
local b
--[[ comment 3a
 comment 3b]]`.trim();
      const output = format(input);
      eq(output, input);
    });

    it('leaves comments in block statements', () => {
      const input = `
-- about to enter for loop
for i = 1, 10 do
  -- this is where we loop
  print(i)
end`.trim();
      const output = format(input);
      eq(output, input);
    });

    it('leaves comments into the various clauses of an "if" statement', () => {
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
-- end comment`.trim();
      const output = format(input);
      eq(output, input);
    });

    it('allows comments between expressions in a statement', () => {
      const input = `
function my_func()
  -- one for the money
  return 1,
    -- two for the show
    2,
    -- three for ... something else?
    3
end`.trim();
      const output = format(input).trim();
      eq(output, input);
    });

    // it('preserves a multi-line function call', () => {

    // });
  });
});
