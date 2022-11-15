import { AnonymousFunctionName } from '../statements';
import { CodeSymbolType } from '../symbols';
import { locationOfToken, parse, deepEquals, bounds } from './test-utils';

describe('SymbolFinder', () => {
  it('defines a symbol for a function', () => {
    const code = `
    function somefn(x, y, z)
      return x + y + z
    end
    `;

    const loc = {
      start: locationOfToken(code, 'function').start,
      end: locationOfToken(code, 'end').end,
    };
    const selectionLoc = locationOfToken(code, 'somefn');

    const { symbols } = parse(code);

    deepEquals(symbols, [
      {
        name: 'somefn',
        detail: '(x,y,z)',
        type: CodeSymbolType.Function,
        loc,
        selectionLoc,
        children: [
          { name: 'x', type: CodeSymbolType.LocalVariable },
          { name: 'y', type: CodeSymbolType.LocalVariable },
          { name: 'z', type: CodeSymbolType.LocalVariable },
        ],
      },
    ]);
  });

  it('defines a symbol for nested functions', () => {
    const { symbols } = parse(`
    function somefn(x)

      function nested(y) print(y) end

      return x
    end
    `);

    deepEquals(symbols, [
      {
        name: 'somefn',
        detail: '(x)',
        type: CodeSymbolType.Function,
        children: [
          { name: 'x', type: CodeSymbolType.LocalVariable },
          {
            name: 'nested', type: CodeSymbolType.Function,
            children: [{ name: 'y', type: CodeSymbolType.LocalVariable }],
          },
        ],
      },
    ]);
  });

  it('defines a symbol for a top-level global variable', () => {
    const { symbols } = parse('i = 1');
    deepEquals(symbols, [{
      name: 'i',
      type: CodeSymbolType.GlobalVariable,
      parentName: undefined,
    }]);
  });

  it('repeats symbol for global variable re-assigned later', () => {
    const { symbols } = parse(`
    i = 1
    i = 2
    `);
    deepEquals(symbols, [
      { name: 'i', type: CodeSymbolType.GlobalVariable, children: [] },
      { name: 'i', type: CodeSymbolType.GlobalVariable, children: [] },
    ]);
  });

  it('defines a symbol for a top-level local variable', () => {
    const { symbols } = parse('local i = 1');
    deepEquals(symbols, [{ name: 'i', type: CodeSymbolType.LocalVariable, children: [] }]);
  });

  it('repeats symbol for local variable re-assigned later', () => {
    const { symbols } = parse(`
    function inside_a_block()
      local i
      i = 1
    end
    `);
    deepEquals(symbols, [
      {
        name: 'inside_a_block',
        children: [
          { name: 'i', type: CodeSymbolType.LocalVariable },
          { name: 'i', type: CodeSymbolType.LocalVariable },
        ],
      },
    ]);
  });

  it('if a local variable is re-used in an inner scope, still determines that it is local', () => {
    const { symbols } = parse(`
    function somefn()
      local i = 1
      return function()
        i = 2
      end
    end
    `);
    deepEquals(symbols, [
      { name: 'somefn',
        children: [
          { name: 'i', type: CodeSymbolType.LocalVariable },
          { name: AnonymousFunctionName, type: CodeSymbolType.Function, children: [
            { name: 'i', type: CodeSymbolType.LocalVariable },
          ] },
        ] },
    ]);
  });

  it('defines symbol for global and local variables in function', () => {
    const { symbols } = parse(`
    function somefn()
      some_global = 0
      local i = 1
    end
    `);
    deepEquals(symbols, [
      {
        name: 'somefn',
        type: CodeSymbolType.Function,
        children: [
          {
            name: 'i',
            type: CodeSymbolType.LocalVariable,
          },
        ],
      },
      {
        name: 'some_global',
        type: CodeSymbolType.GlobalVariable,
      },
    ]);
  });

  it('defines symbols for variables inside control-flow constructs', () => {
    const { symbols } = parse(`
    function somefn()
      -- for numeric
      for i=1,10 do
        local f
      end
      -- for generic
      for k, v in pairs(tbl) do
        local g = k
        print(g)
      end
      -- while
      while f do
        local ghert = 10
      end
      -- repeat
      repeat
        local testing = 5
      until 5 == 7
      -- do
      do
      local testing_do = 5
      end
      -- if/elseif/else
      if false then
        local if1 = 1
      elseif false then
        local if2 = 1
      else
        local if3 = 1
      end
    end`);
    deepEquals(symbols, [
      { name: 'somefn', type: CodeSymbolType.Function, children: [
        // for numeric
        { name: 'i' }, { name: 'f' },
        // for generic
        { name: 'k' }, { name: 'v' }, { name: 'g' },
        // while
        { name: 'ghert' },
        // repeat
        { name: 'testing' },
        // do
        { name: 'testing_do' },
        // if/elseif/else
        { name: 'if1' }, { name: 'if2' }, { name: 'if3' },
      ] },
    ]);
  });

  it('repeats symbols for local/global variable re-use', () => {
    const { symbols } = parse(`
    function somefn()
      some_global = 0
      local i = 1
      i = 47
      some_global = 29
    end
    `);
    deepEquals(symbols, [
      { name: 'somefn', type: CodeSymbolType.Function, children: [
        { name: 'i', type: CodeSymbolType.LocalVariable },
        { name: 'i', type: CodeSymbolType.LocalVariable },
      ] },
      { name: 'some_global', type: CodeSymbolType.GlobalVariable },
      { name: 'some_global', type: CodeSymbolType.GlobalVariable },
    ]);
  });

  it('provides a function type symbol for a variable that is assigned a function', () => {
    const { symbols } = parse(`
    somefn = function(x)
      return x
    end`);

    deepEquals(symbols, [{ name: 'somefn', type: CodeSymbolType.Function }]);
  });

  it('provides a symbol for a table member', () => {
    const { symbols } = parse(`
    thing = {
      asdf = {},
      trav = function() end,
    }`);

    deepEquals(symbols, [
      { name: 'thing', type: CodeSymbolType.GlobalVariable, children: [
        { name: 'asdf', type: CodeSymbolType.LocalVariable },
        { name: 'trav', type: CodeSymbolType.Function },
      ] },
    ]);
  });

  it('provides symbols for nested table members', () => {
    const { symbols } = parse(`
    thing = {
      zxc = '1',
      asdf = {
        qwe = 2,
        ert = function() end,
      },
      trav = function() end,
    }`);

    deepEquals(symbols, [
      { name: 'thing', type: CodeSymbolType.GlobalVariable, children: [
        { name: 'zxc', type: CodeSymbolType.LocalVariable },
        { name: 'asdf', type: CodeSymbolType.LocalVariable, children: [
          { name: 'qwe', type: CodeSymbolType.LocalVariable },
          { name: 'ert', type: CodeSymbolType.Function },
        ] },
        { name: 'trav', type: CodeSymbolType.Function },
      ] },
    ]);
  });

  it('doesn\'t provide empty symbol for non-symbol-creating assignment statement', () => {
    const { symbols } = parse(`
    function particles:spawn(props)
      self.ps[rnd()]=particle(props)
    end
    `);
    deepEquals(symbols,
      [{ name: 'particles.spawn', type: CodeSymbolType.Function, children: [
        { name: 'props', type: CodeSymbolType.LocalVariable },
      ] }]);
  });

  it('handles member expressions appropriately', () => {
    const { symbols } = parse(`
    tbl = {}
    tbl.some_key = 5

    function somefn()
      local loc_tab = {}
      loc_tab.another_key = 6
      loc_tab.nested = {}
      loc_tab.nested.third_value = 7
    end
    `);
    deepEquals(symbols, [
      { name: 'tbl', type: CodeSymbolType.GlobalVariable, children: [] },
      { name: 'tbl.some_key', type: CodeSymbolType.GlobalVariable, children: [] },
      { name: 'somefn', type: CodeSymbolType.Function, children: [
        { name: 'loc_tab', type: CodeSymbolType.LocalVariable },
        { name: 'loc_tab.another_key', type: CodeSymbolType.LocalVariable },
        { name: 'loc_tab.nested', type: CodeSymbolType.LocalVariable },
        { name: 'loc_tab.nested.third_value', type: CodeSymbolType.LocalVariable },
      ] },
    ]);
  });

  it('handles member expressions referencing parameters appropriately', () => {
    const { symbols } = parse(`
    function somefn(_this)
      _this.val = 5
    end
    `);
    deepEquals(symbols, [
      { name: 'somefn', type: CodeSymbolType.Function, children: [
        { name: '_this', type: CodeSymbolType.LocalVariable },
        { name: '_this.val', type: CodeSymbolType.LocalVariable },
      ] },
    ]);
  });

  it('creates a symbol for a label', () => {
    const { symbols } = parse('::this_label::');
    deepEquals(symbols, [
      { name: 'this_label', type: CodeSymbolType.Label, children: [] },
    ]);
  });

  it('provides symbols around ? print shorthand', () => {
    const code = `
function debug_draw()
circfill(mx,my,lmb>0 and 2 or 1,7)
local f,g = flags[fmx+fmy*128], switch[fmx+fmy*128]
?fmx.." "..fmy,1,122,12
end`;
    const { errors, symbols } = parse(code);
    deepEquals(errors, []);
    // Issue #17: the `debug_draw` function has the wrong location
    deepEquals(symbols, [{ name: 'debug_draw', type: 'Function', loc: bounds(2, 0, 6, 3) }]);
  });

  describe('handles "self" inside function definitions', () => {
    it('normal case', () => {
      const { symbols } = parse(`
      function tbl:somefn()
        self.val = 5
        local another_tbl = {}
        function another_tbl:update()
          self.val2 = 6
        end
      end
      `);
      deepEquals(symbols, [
        { name: 'tbl.somefn', children: [
          { name: 'another_tbl', type: CodeSymbolType.LocalVariable },
          { name: 'another_tbl.update', type: CodeSymbolType.Function, children: [
            { name: 'another_tbl.val2', type: CodeSymbolType.LocalVariable },
          ] },
        ] },
        { name: 'tbl.val', type: CodeSymbolType.GlobalVariable },
      ]);
    });

    it('in an assignment statement', () => {
      const { symbols } = parse(`
      function somefn()
        local something = {}
        something.blah = function()
          -- 'self' should resolve to 'something'
          self.val = 5
        end
        return something
      end
      `);
      deepEquals(symbols, [
        { name: 'somefn', children: [
          { name: 'something', type: CodeSymbolType.LocalVariable },
          { name: 'something.blah', type: CodeSymbolType.Function, children: [
            { name: 'something.val', type: CodeSymbolType.LocalVariable },
          ] },
        ] },
      ]);
    });

    it('in an indexer assignment statement', () => {
      const { symbols } = parse(`
      function somefn()
        local something = {}
        something[1] = function()
          -- We don't have the ability to parse indexer expressions
          -- for 'self'. So this should still be 'self'
          self.val = 5
        end
        return something
      end
      `);
      deepEquals(symbols, [
        { name: 'somefn', children: [
          { name: 'something', type: CodeSymbolType.LocalVariable },
          { name: AnonymousFunctionName, type: CodeSymbolType.Function, children: [] },
        ] },
        { name: 'self.val', type: CodeSymbolType.GlobalVariable },
      ]);
    });

    it('in a table constructor', () => {
      const { symbols } = parse(`
      function somefn()
        local something = {
          blah = function()
            self.val = 5
          end
        }
        return something
      end
      `);
      deepEquals(symbols, [
        { name: 'somefn', children: [
          { name: 'something', type: CodeSymbolType.LocalVariable, children: [
            { name: 'blah', type: CodeSymbolType.Function, children: [
              { name: 'something.val', type: CodeSymbolType.LocalVariable, children: [] },
            ] },
          ] },
        ] },
      ]);
    });

    it('case where there is no existing self referece', () => {
      const { symbols } = parse(`
      function somefn()
        self.val = 5
      end
      `);
      deepEquals(symbols, [
        { name: 'somefn' },
        { name: 'self.val' },
      ]);
    });
  });
});
