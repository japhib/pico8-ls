import { strictEqual as eq } from 'assert';
import Parser from '../parser';
import { Chunk } from '../statements';
import { CodeSymbolType } from '../types';
import { getTestFileContents } from './test-utils';

function parse(input: string): Chunk {
  return new Parser(input).parseChunk();
}

function deepEqualsAST(code: string, expected: any) {
  const { body } = parse(code);
  deepEquals(body, expected);
}

function deepEquals(actual: any, expected: any) {
  eq(typeof actual, typeof expected, 'types don\'t match!');

  if (typeof expected === 'object') {
    if (Array.isArray(expected)) return deepEqualsArray(actual, expected);
    else return deepEqualsObject(actual, expected);
  } else {
    eq(actual, expected, 'values don\'t match!');
  }
}

function deepEqualsArray(actual: any[], expected: any[]) {
  eq(actual.length, expected.length, 'array lengths don\'t match!');

  for (let i = 0; i < expected.length; i++) {
    deepEquals(actual[i], expected[i]);
  }
}

function deepEqualsObject(actual: any, expected: any) {
  for (const key of Object.keys(expected)) {
    deepEquals(actual[key], expected[key]);
  }
}

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

  describe.only('symbols', () => {
    it('defines a symbol for a function', () => {
      const { symbols } = parse(`
      function somefn(x, y, z)
        return x + y + z
      end
      `);

      deepEquals(symbols, [{
        name: 'somefn',
        type: CodeSymbolType.Function,
        parentName: undefined,
      }]);
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
          type: CodeSymbolType.Function,
          parentName: undefined,
        },
        {
          name: 'nested',
          type: CodeSymbolType.Function,
          parentName: 'somefn',
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

    it('doesn\'t repeat symbol for global variable re-assigned later', () => {
      const { symbols } = parse(`
      i = 1
      i = 2
      `);
      deepEquals(symbols, [{
        name: 'i',
        type: CodeSymbolType.GlobalVariable,
        parentName: undefined,
      }]);
    });

    it('defines a symbol for a top-level local variable', () => {
      const { symbols } = parse('local i = 1');
      deepEquals(symbols, [{
        name: 'i',
        type: CodeSymbolType.LocalVariable,
        parentName: undefined,
      }]);
    });

    it('doesn\'t repeat symbol for local variable assigned later', () => {
      const { symbols } = parse(`
      local i
      i = 1
      `);
      deepEquals(symbols, [{
        name: 'i',
        type: CodeSymbolType.LocalVariable,
        parentName: undefined,
      }]);
    });

    it('defines symbol for global and local variables in function, with parentName set appropriately', () => {
      const { symbols } = parse(`
      function somefn()
        some_global = 0
        local i = 1
      end
      `);
      deepEquals(symbols, [
        { name: 'somefn', type: CodeSymbolType.Function },
        {
          name: 'some_global',
          type: CodeSymbolType.GlobalVariable,
          // Note the global doesn't have parentName
          parentName: undefined,
        },
        {
          name: 'i',
          type: CodeSymbolType.LocalVariable,
          parentName: 'somefn',
        },
      ]);
    });

    it('does not repeat symbols for local/global variable re-use', () => {
      const { symbols } = parse(`
      function somefn()
        some_global = 0
        local i = 1
        i = 47
        some_global = 29
      end
      `);
      deepEquals(symbols, [
        { name: 'somefn', type: CodeSymbolType.Function },
        { name: 'some_global', type: CodeSymbolType.GlobalVariable, parentName: undefined },
        { name: 'i', type: CodeSymbolType.LocalVariable, parentName: 'somefn' },
      ]);
    });
  });
});
