import { strictEqual as eq } from 'assert';
import { CodeSymbolType } from '../types';
import { deepEquals, deepEqualsAST, getTestFileContents, locationOfToken, parse } from './test-utils';

describe('Parser', () => {
  it('parses basic assignment statement', () => {
    deepEqualsAST('i = 1', [
      {
        type: 'AssignmentStatement',
        operator: '=',
        variables: [{
          type: 'Identifier',
          name: 'i',
          isLocal: false,
        }],
        init: [{
          type: 'NumericLiteral',
          value: 1,
        }],
      },
    ]);
  });

  it('parses basic function declaration', () => {
    deepEqualsAST('function f(x)\nreturn x + 1\nend', [{
      type: 'FunctionDeclaration',
      isLocal: false,
      identifier: { name: 'f' },
      parameters: [{ type: 'Identifier', name: 'x' }],
      body: [{
        type: 'ReturnStatement',
        arguments: [{
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Identifier', name: 'x' },
          right: { type: 'NumericLiteral', value: 1 },
        }],
      }],
    }]);
  });

  it('parses function declaration with multiple args', () => {
    deepEqualsAST('function fn(x, y, z) return end', [{
      type: 'FunctionDeclaration',
      isLocal: false,
      identifier: { name: 'fn' },
      parameters: [
        { type: 'Identifier', name: 'x' },
        { type: 'Identifier', name: 'y' },
        { type: 'Identifier', name: 'z' },
      ],
      body: [{
        type: 'ReturnStatement',
        arguments: [],
      }],
    }]);
  });

  it('parses call statement', () => {
    deepEqualsAST('print("hi")', [{
      type: 'CallStatement',
      expression: {
        type: 'CallExpression',
        base: { type: 'Identifier', name: 'print' },
        arguments: [{ type: 'StringLiteral', value: 'hi' }],
      },
    }]);
  });

  it('parses if statement', () => {
    const printHi = [{
      type: 'CallStatement',
      expression: {
        type: 'CallExpression',
        base: { type: 'Identifier', name: 'print' },
        arguments: [{ type: 'StringLiteral', value: 'hi' }],
      },
    }];

    deepEqualsAST('if false then print("hi") elseif false then print("hi") else print("hi") end', [{
      type: 'IfStatement',
      clauses: [
        {
          type: 'IfClause',
          condition: { type: 'BooleanLiteral', value: false },
          body: printHi,
        },
        {
          type: 'ElseifClause',
          condition: { type: 'BooleanLiteral', value: false },
          body: printHi,
        },
        {
          type: 'ElseClause',
          body: printHi,
        },
      ],
    }]);
  });

  it('parses PICO-8 if statement', () => {
    deepEqualsAST('if (false) print("hi")\ni = 1', [
      {
        type: 'IfStatement',
        clauses: [{
          type: 'IfClause',
          condition: { type: 'BooleanLiteral', value: false },
          body: [{
            type: 'CallStatement',
            expression: {
              type: 'CallExpression',
              base: { type: 'Identifier', name: 'print' },
              arguments: [{ type: 'StringLiteral', value: 'hi' }],
            },
          }],
        },
        ],
      },
      {
        type: 'AssignmentStatement',
        operator: '=',
        variables: [{
          type: 'Identifier',
          name: 'i',
          isLocal: false,
        }],
        init: [{
          type: 'NumericLiteral',
          value: 1,
        }],
      },
    ]);
  });

  it('parses PICO-8 if statement with a significant newline', () => {
    // If it doesn't treat the newline as significant, it'll interpret it as "return i" instead of just "return"
    deepEqualsAST('if (false) return\ni += 1', [
      {
        type: 'IfStatement',
        clauses: [{
          type: 'IfClause',
          condition: { type: 'BooleanLiteral', value: false },
          body: [{ type: 'ReturnStatement', arguments: [] }],
        }],
      },
      {
        type: 'AssignmentStatement',
        operator: '+=',
        variables: [{
          type: 'Identifier',
          name: 'i',
          isLocal: false,
        }],
        init: [{
          type: 'NumericLiteral',
          value: 1,
        }],
      },
    ]);
  });

  it('skips header and footer sections', () => {
    const code = `pico-8 cartridge // http://www.pico-8.com
version 29
__lua__

__gfx__
0000000000001156eed0ed0eeeeeee`;
    deepEqualsAST(code, []);
  });

  it('parses low.p8', () => {
    const { errors } = parse(getTestFileContents('low.p8'));
    eq(errors.length, 0, 'Unexpected errors: ' + errors.map(e => `[${e.bounds.start.line}:${e.bounds.end.column}] ${e.message}`).join(','));
  });

  describe('error handling', () => {
    it('handles malformed function definition', () => {
      const { errors } = parse('function[] end');
      deepEquals(errors, [{ message: '<name> expected near \'[\'' }]);
    });

    it('if an error occurs inside a block, it breaks out of the block and continues parsing', () => {
      const { body, errors } = parse(`
      i = 1
      function somefn()
        blah blah blah
      end
      i = 2
      `);

      deepEquals(errors, [{ message: 'assignment operator expected near \'blah\'' }]);
      deepEquals(body, [{ type: 'AssignmentStatement' }, { type: 'FunctionDeclaration' }, { type: 'AssignmentStatement' }]);
    });

    it('finds multiple errors on different lines in a block', () => {
      const { errors } = parse(`
      blah blah blah
      blah blah blah
      blah blah blah
      `);

      deepEquals(errors, [
        { message: 'assignment operator expected near \'blah\'' },
        { message: 'assignment operator expected near \'blah\'' },
        { message: 'assignment operator expected near \'blah\'' },
      ]);
    });

    it('can catch an error in both the function parameters and function body', () => {
      const { errors } = parse(`
      function somefn(i + 1, i + 2, i + 3)
        blah() * 3
      end
      `);
      deepEquals(errors, [
        { message: '\')\' expected near \'+\'' },
        { message: 'unexpected symbol \'*\' near \'3\'' },
      ]);
    });
  });

  describe('symbols', () => {
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
});
