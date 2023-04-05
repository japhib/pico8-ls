import { TestFilesResolver, TestParseOptions, deepEquals, getTestFileContents, parse } from './test-utils';
import { strictEqual as eq } from 'assert';
import Formatter, { FormatResult } from '../formatter';
import { FileResolver } from '../file-resolver';

function formatLua(text: string, opts: TestParseOptions = {}): string {
  const chunk = parse(text, opts);

  // should be no errors
  deepEquals(chunk.errors, []);

  const formatter = new Formatter();
  const result = formatter.formatChunk(chunk, text, true);
  return result!.formattedText;
}

function formatRaw(text: string, isPlainLuaFile: boolean): FormatResult | undefined {
  const chunk = parse(text);

  // should be no errors
  deepEquals(chunk.errors, []);

  const formatter = new Formatter();
  const result = formatter.formatChunk(chunk, text, isPlainLuaFile);
  return result;
}

// TODO: add a test for `opts = opts or {}` to not add parentheses around `{}`
describe('Formatter', () => {
  it('declines to format chunk when errors present', () => {
    const text = 'a b c';
    const chunk = parse(text);
    const formatter = new Formatter();
    eq(formatter.formatChunk(chunk, text, true), undefined);
  });

  describe('Formats entire files', () => {
    // TODO: write proper tests for the final implementation
    it.skip('formats low.p8', () => {
      const formatted = formatLua(getTestFileContents('low.p8'));
      console.log(formatted);
    });

    it.skip('formats low.lua', () => {
      const formatted = formatLua(getTestFileContents('low.lua'));
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
        const formattedContent = formatLua(initialContent);
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

        const contentFormattedOnce = formatLua(initialContent);
        const contentFormattedTwice = formatLua(contentFormattedOnce);

        eq(contentFormattedTwice, contentFormattedOnce);
      });
    });
  });

  describe('Formats specific types of statements', () => {
    it('formats for loop', () => {
      const input = '	for i=0,29 do add(got_fruit,false) end';
      const formatted = formatLua(input);
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
      const formatted = formatLua(input);
      eq(formatted, `
a = not a
a = #a
a = -a`.trim());
    });

    it('doesn\'t inline #include statements', () => {
      const fileResolver = new TestFilesResolver({
        'lib.lua': 'function lib_fn(x)\nprint(x)\nend'
      })

      const input = `
#include lib.lua

function some_fn()
  lib_fn('hi!')
end
`.trim();
      const formatted = formatLua(input, { includeFileResolver: fileResolver });
      eq(formatted, input);
    });

    it('doesn\'t put in several newlines for #include-ing a file with a lot of statements', () => {
      const fileResolver = new TestFilesResolver({
        'lib.lua': 'print("a")\nprint("a")\nprint("a")\nprint("a")\nprint("a")\nprint("a")\nprint("a")\nprint("a")\n'
      })

      const input = `
#include lib.lua

function some_fn()
  lib_fn('hi!')
end
`.trim();
      const formatted = formatLua(input, { includeFileResolver: fileResolver });
      eq(formatted, input);
    });

    it('handles local statements even without initializer', () => {
      const input = 'local a';
      const formatted = formatLua(input);
      eq(formatted, 'local a');
    });

    it('preserves local keyword used for a function declaration', () => {
      const input = `
local function some_fn()
end`.trim();
      const formatted = formatLua(input);
      eq(formatted, `
local function some_fn()
end`.trim());
    });

    describe('handles parentheses correctly', () => {

      it('preserves parentheses when their inner expression is called as a function', () => {
        const input = `
(fn1 or fn_2)()`.trim();
        const formatted = formatLua(input);
        eq(formatted, `
(fn1 or fn_2)()`.trim());
      });

      it('preserves parentheses around function definition when called immediately', () => {
        const input = `
(function()
  do_something()
end)()`.trim();
        const formatted = formatLua(input);
        eq(formatted, `
(function()
  do_something()
end)()`.trim());
      });

      it('preserves parentheses when a property is called on their inner expression', () => {
        const input = `
(table1 or table2).some_property()`.trim();
        const formatted = formatLua(input);
        eq(formatted, `
(table1 or table2).some_property()`.trim());
      });

      it('preserves parentheses when a property is accessed by value on their inner expression', () => {
        const input = `
local result = ({
  [123] = "xyz"
})[123]`.trim();
        eq(formatLua(input), input);
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
        const formatted = formatLua(input);
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
        const formatted = formatLua(input);
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
      eq(formatLua(input), input);
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
      eq(formatLua(input), input);
    });

    it('preserves a multi-line table constructor with only one field', () => {
      const input = `
local a = {
  -- I like this here
  b = 2
}`.trim();
      eq(formatLua(input), input);
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
      eq(formatLua(input).trim(), input.trim());
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
      eq(formatLua(input), input);
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
      eq(formatLua(input), input);
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
      eq(formatLua(input), input);
    });

    it('keeps comments at the end of "if" statement clauses', () => {
      const input = `
if a < 1 then
  a = 2
  -- end comment
end`.trim();
      eq(formatLua(input), input);
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
      eq(formatLua(input), input);
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
      const output = formatLua(input).trim();
      eq(output, input);
    });

    it('preserves a multi-line function call', () => {
      const input = `
call_some_func(
  first_arg,
  second_arg,
  third_arg
)`.trim();
      eq(formatLua(input), input);
    });

    it('preserves comments inside deeply nested table/function declarations', () => {
      const input = `
local player = {
  update = function(this)
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
  end,
  -- comment at end of table
}`.trim();
      eq(formatLua(input), input);
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
      const actual = formatLua(input);
      console.log('actual: ', actual)
      eq(formatLua(input), input);
    });

    it('keeps single blank lines within a function', () => {
      const input = `
function f1()
  local a = 'aaa'

  -- some comment
  local b = 'bbb'

  printh("inside f1")
end`.trim();
      eq(formatLua(input), input);
    });

    it('keeps single blank lines within a function returned from another function', () => {
      const input = `
function f1()
  return function()
    local a = 'aaa'

    -- some comment
    local b = 'bbb'

    printh("inside f1")
  end
end`.trim();
      eq(formatLua(input), input);
    });

    it('keeps single blank lines within an if statement', () => {
      const input = `
if true then
  local a = 'aaa'

  -- some comment
  local b = 'bbb'

  printh("inside if statement")
end`.trim();
      eq(formatLua(input), input);
    });

    it('merges multiple consecutive blank lines into a single one', () => {
      const input = `
local a = "aaa"
local b = "bbb"



-- x and y:
local x, y = 111, 222`.trim();
      eq(formatLua(input), `
local a = "aaa"
local b = "bbb"

-- x and y:
local x, y = 111, 222`.trim());
    });
  });

  describe('Range returned by formatter', () => {
    it('is correct for lua files', () => {
      const text = `
function a()
  print('hi!')
end

a()
`.trim();
      const result = formatRaw(text, true);
      deepEquals(result!.formattedRange, {
        start: { line: 0, character: 0 },
        end: { line: Number.MAX_VALUE, character: 0 }
      })
    })

    it('is correct for pico-8 files', () => {
      const text = `
pico-8 cartridge // http://www.pico-8.com
version 29
__lua__

function a()
  print('hi!')
end

a()

__gfx__
000000000000000000000000
000000000000000000000000
`.trim();
      const result = formatRaw(text, false);
      deepEquals(result!.formattedRange, {
        start: { line: 3, character: 0 },
        end: { line: 10, character: 0 }
      })
    })

    it('is correct for pico-8 files lacking end tag', () => {
      const text = `
pico-8 cartridge // http://www.pico-8.com
version 29
__lua__

function a()
  print('hi!')
end

a()
`.trim();
      const result = formatRaw(text, false);
      deepEquals(result!.formattedRange, {
        start: { line: 3, character: 0 },
        end: { line: Number.MAX_VALUE, character: 0 }
      })
    })

    it('declines to format pico-8 files lacking lua code section', () => {
      const text = `
pico-8 cartridge // http://www.pico-8.com
version 29
__gfx__
000000000000000000000000
000000000000000000000000
`.trim();
      const result = formatRaw(text, false);
      eq(result, undefined);
    })
  })
});
