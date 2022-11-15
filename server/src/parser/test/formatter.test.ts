import { deepEquals, getTestFileContents, parse } from './test-utils';
import { strictEqual as eq } from 'assert';
import Formatter from '../formatter';
import structuredClone from '@ungap/structured-clone';

function format(text: string): string {
  const chunk = parse(text);
  const formatter = new Formatter();
  return formatter.formatChunk(chunk);
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

  describe('Preserves code structure', () => {
    [
      // TODO: uncomment this test file and make its test pass
      // 'low.lua',
      'simple-and-short.lua',
      //TODO: test for this file takes a long time or reaches timeout (at least in WebStorm IDE). Fix related performance issues
      // 'beetrootpaul-dart-07/game.lua',
      // TODO: uncomment this test file and make its test pass
      // 'beetrootpaul-dart-07/hud.lua',
      //TODO: test for this file takes a long time or reaches timeout (at least in WebStorm IDE). Fix related performance issues
      // 'beetrootpaul-dart-07/mission_1.lua',
      'beetrootpaul-dart-07/movement_fixed_factory.lua',
      'beetrootpaul-dart-07/multicart.lua',
      // TODO: uncomment this test file and make its test pass
      // 'beetrootpaul-dart-07/player_bullet.lua',
      // TODO: uncomment this test file and make its test pass
      // 'beetrootpaul-dart-07/screen_title.lua',
    ].forEach(filename => {
      it(`does not change AST structure on format (filename: "${filename}")`, () => {
        const initialContent = getTestFileContents(filename);
        const initialAst = parse(initialContent);

        // call structuredClone before formatChunk because formatChunk inserts comments/whitespace nodes
        const formattedContent = new Formatter().formatChunk(structuredClone(initialAst));
        const newAst = parse(formattedContent);

        deepEquals(
          newAst.block,
          initialAst.block,
          {
            objectKeyOmitFn: key => key === 'loc',
            arrayItemOmitFn: item => item?.type == 'Comment' || item?.type == 'Whitespace',
          },
        );
      });

      it(`does not change code on subsequent formats (filename: "${filename}")`, () => {
        const initialContent = getTestFileContents(filename);

        const contentFormattedOnce = new Formatter().formatChunk(parse(initialContent));
        const contentFormattedTwice = new Formatter().formatChunk(parse(contentFormattedOnce));

        eq(contentFormattedTwice, contentFormattedOnce);
      });
    });
  });

  describe('Formats specific types of statements', () => {
    it('formats for loop', () => {
      const input = '	for i=0,29 do add(got_fruit,false) end';
      const formatted = format(input);
      eq(formatted, `
for i = 0, 29 do
  add(got_fruit, false)
end`.trim());
    });

    it('properly formats unary expressions', () => {
      const input = `
a = not a
a = #a
a = -a`.trim();
      const formatted = format(input);
      eq(formatted, `
a = not a
a = #a
a = -a`.trim());
    });

    it('doesn\'t inline #include statements', () => {
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
end`.trim();
      const formatted = format(input);
      eq(formatted, `
local function some_fn()
end`.trim());
    });

    describe('handles parentheses correctly', () => {

      it('preserves parentheses when their inner expression is called as a function', () => {
        const input = `
(fn1 or fn_2)()`.trim();
        const formatted = format(input);
        eq(formatted, `
(fn1 or fn_2)()`.trim());
      });

      it('preserves parentheses around function definition when called immediately', () => {
        const input = `
(function()
  do_something()
end)()`.trim();
        const formatted = format(input);
        eq(formatted, `
(function()
  do_something()
end)()`.trim());
      });

      it('preserves parentheses when a property is called on their inner expression', () => {
        const input = `
(table1 or table2).some_property()`.trim();
        const formatted = format(input);
        eq(formatted, `
(table1 or table2).some_property()`.trim());
      });

      it('preserves parentheses when a property is accessed by value on their inner expression', () => {
        const input = `
local result = ({
  [123] = "xyz"
})[123]`.trim();
        eq(format(input), input);
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
)`.trim();
        const formatted = format(input);
        // TODO: ideally we would assert presence of parentheses, while ignoring if new lines are there or not, since they are not a subject of this test
        eq(formatted, `
a = some_var_1 - (some_var_2 - some_var_3)
b = some_var_1 / (some_var_2 / some_var_3)
c = 1 - (t - 1) ^ 2
d = (some_var_1 - 111 * 222) / 333
e = (some_var_2 - 111) * 222
f = (some_var_3 + 111) % 222
g = some_table.some_fn(
  some_var_4 * (rnd() - .5),
  some_var_5 * (rnd() - .5)
)`.trim());
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
h = (some_var_1 / some_var_2) / some_var_3`.trim();
        const formatted = format(input);
        eq(formatted, `
a = some_var_1 + some_var_2 + some_var_3
b = some_var_1 * some_var_2 * some_var_3
c = some_var_1 + some_var_2 + some_var_3
d = some_var_1 * some_var_2 * some_var_3
e = some_var_1 + some_var_2 + some_var_3
f = some_var_1 * some_var_2 * some_var_3
g = some_var_1 - some_var_2 - some_var_3
h = some_var_1 / some_var_2 / some_var_3`.trim());
      });
    });
  });

  describe('preserves comments', () => {
    it('keeps comments around local statements', () => {
      const input = `
--[[ there is
     some comment
     A ]]
local a = 1
local b = 2
-- there is some comment B
-- there is some comment C
local c = a * b
local d = a / b
--[[ there is
     some comment
     D ]]
--[[ there is
     some comment
     E ]]
local e = d - c - b - a
-- there is some comment F`.trim();
      eq(format(input), input);
    });

    it('keeps comments around and inside a table constructor', () => {
      const input = `
-- comment before a table constructor
local a = {
  --[[Some key which serves
   some purpose:]]
  some_key = 111,
  -- some_key = 222,
  another_key = 333,
  -- another_key = 444,
}
-- comment after a table constructor`.trim();
      eq(format(input), input);
    });

    it('preserves a multi-line table constructor with only one field', () => {
      const input = `
local a = {
  -- I like this here
  b = 2
}`.trim();
      eq(format(input), input);
    });

    it('keeps comments around and inside a statement function', () => {
      const input = `
-- comment before a statement function
function a(b)
  -- print(b)
  do_something(b)
  --[[
    do_another_thing(b)
    do_another_thing(b + 1)
  ]]
  do_something_totally_different(b)
  -- print(b - 1)
end

-- comment after a statement function`;
      // There's some weird newline behavior going on with this test.
      // For now, just trimming both strings before we compare them.
      eq(format(input).trim(), input.trim());
    });

    it('keeps comments around and inside an assigned function (case of global assignment)', () => {
      const input = `
-- comment before an assigned function
a = function(b)
  -- print(b)
  do_something(b)
  --[[
    do_another_thing(b)
    do_another_thing(b + 1)
  ]]
  do_something_totally_different(b)
  -- print(b - 1)
end
-- comment after an assigned function`.trim();
      eq(format(input), input);
    });

    it('keeps comments around and inside an assigned function (case of local assignment)', () => {
      const input = `
-- comment before an assigned function
local a = function(b)
  -- print(b)
  do_something(b)
  --[[
    do_another_thing(b)
    do_another_thing(b + 1)
  ]]
  do_something_totally_different(b)
  -- print(b - 1)
end
-- comment after an assigned function`.trim();
      eq(format(input), input);
    });

    it('keeps comments around and inside block statements', () => {
      const input = `
-- comment before block statement
for i = 1, 10 do
  -- print(i)
  do_something(i)
  --[[
    do_another_thing(i)
    do_another_thing(i + 1)
  ]]
  do_something_totally_different(i)
  -- print(i - 1)
end
-- comment before after statement`.trim();
      eq(format(input), input);
    });

    it('keeps comments at the end of "if" statement clauses', () => {
      const input = `
if a < 1 then
  a = 2
  -- end comment
end`.trim();
      eq(format(input), input);
    });

    it('keeps comments around and inside "if" statement clauses', () => {
      const input = `
-- comment before "if" statement
if a < 1 then
  -- print(a)
  do_something(a)
  --[[
  print(b)
  ]]
  do_something_totally_different(a)
  -- print(b - 1)
elseif a == 1 then
  -- print(c)
  do_something(a)
  --[[
  print(d)
  ]]
  do_something_totally_different(a)
  -- print(e - 2)
else
  -- print(f)
  do_something(a)
  --[[
  print(g)
  ]]
  do_something_totally_different(a)
  -- print(h - 1)
end
-- comment after "if" statement`.trim();
      eq(format(input), input);
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

    it('preserves a multi-line function call', () => {
      const input = `
call_some_func(
  first_arg,
  second_arg,
  third_arg
)`.trim();
      eq(format(input), input);
    });

    it('preserves comments inside deeply nested table/function declarations', () => {
      const input = `
local player = {
  update = function (this)
    -- change position based on velocity
    this.x += this.vel_x

    -- make a nested table
    local nested_tbl = {
      -- something in the table
      blah = 'blah',
      -- then ANOTHER nested function
      get_tbl = function(a)
        return {
          -- which, incredibly, has ANOTHER nested table inside of it
          incremented = a + 1
        }
      end,
      -- last comment
    }

    -- comment at end of function
  end
  -- comment at end of table
}`.trim();
      eq(format(input), input);
    });
  });

  describe('preserve single blank lines', () => {
    it('keeps single blank lines between lines with code', () => {
      const input = `
local a = "aaa"
local b = "bbb"

local x, y = 111, 222

---------------
-- functions --
---------------

function f1()
  printh("inside f1")
end

function f2()
  printh("inside f2")
end`.trim();
      eq(format(input), input);
    });

    it('merges multiple consecutive blank lines into a single one', () => {
      const input = `
local a = "aaa"
local b = "bbb"



-- x and y:
local x, y = 111, 222`.trim();
      eq(format(input), `
local a = "aaa"
local b = "bbb"

-- x and y:
local x, y = 111, 222`.trim());
    });
  });
});
