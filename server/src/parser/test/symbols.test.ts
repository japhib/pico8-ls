import { CodeSymbolType } from '../symbols';
import { locationOfToken, parse, deepEquals } from './test-utils';

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

  it('defines symbol for global and local variables in function, with parentName set appropriately', () => {
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

    deepEquals(symbols, [{ name: 'somefn', type: CodeSymbolType.Function, parentName: undefined }]);
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

  it('doesn\'t provide empty symbol for non-symbol-creating assignment statement', () => {
    const { symbols } = parse(`
		function particles:spawn(props)
			self.ps[rnd()]=particle(props)
		end
		`);
    deepEquals(symbols, [{ name: 'particles:spawn', type: CodeSymbolType.Function }]);
  });
});