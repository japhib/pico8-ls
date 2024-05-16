import { strictEqual as eq } from 'assert';
import { bounds, deepEquals, deepEqualsAST, getTestFileContents, MockFileResolver, parse } from './test-utils';

describe('Parser', () => {
  it('parses basic assignment statement', () => {
    const { block: { body } } = parse('i = 1');
    deepEquals(body, [
      {
        type: 'AssignmentStatement',
        operator: '=',
        variables: [{
          type: 'Identifier',
          name: 'i',
          isLocal: false,
          loc: bounds(1, 0, 1, 1),
        }],
        init: [{
          type: 'NumericLiteral',
          value: 1,
          loc: bounds(1, 4, 1, 5),
        }],
        loc: bounds(1, 0, 1, 5),
      },
    ]);
  });

  it('parses expression with parentheses', () => {
    const { block: { body } } = parse('a = 1 - (t + 2)^3');
    deepEquals(body, [
      {
        loc: bounds(1, 0, 1, 17),
        type: 'AssignmentStatement',
        operator: '=',
        init: [
          {
            loc: bounds(1, 4, 1, 17),
            type: 'BinaryExpression',
            operator: '-',
            left: {
              loc: bounds(1, 4, 1, 5),
              type: 'NumericLiteral',
              value: 1,
              raw: '1',
            },
            right: {
              loc: bounds(1, 8, 1, 17),
              type: 'BinaryExpression',
              operator: '^',
              left: {
                loc: bounds(1, 9, 1, 14),
                type: 'BinaryExpression',
                operator: '+',
                left: {
                  loc: bounds(1, 9, 1, 10),
                  type: 'Identifier',
                  name: 't',
                  isLocal: false,
                },
                right: {
                  loc: bounds(1, 13, 1, 14),
                  type: 'NumericLiteral',
                  value: 2,
                  raw: '2',
                },
              },
              right: {
                loc: bounds(1, 16, 1, 17),
                type: 'NumericLiteral',
                value: 3,
                raw: '3',
              },
            },
          },
        ],
      },
    ]);
  });

  it('parses basic function declaration', () => {
    const { block } = parse('function f(x)\nreturn x + 1\nend');
    deepEquals(block, {
      type: 'Block',
      body: [{
        type: 'FunctionDeclaration',
        isLocal: false,
        identifier: {
          type: 'Identifier',
          name: 'f',
          loc: bounds(1, 9, 1, 10),
        },
        parameters: [{
          type: 'Identifier',
          name: 'x',
          loc: bounds(1, 11, 1, 12),
        }],
        block: {
          type: 'Block',
          body: [{
            type: 'ReturnStatement',
            arguments: [{
              type: 'BinaryExpression',
              operator: '+',
              left: { type: 'Identifier', name: 'x', loc: bounds(2, 7, 2, 8) },
              right: { type: 'NumericLiteral', value: 1, loc: bounds(2, 11, 2, 12) },
              loc: bounds(2, 7, 2, 12),
            }],
            loc: bounds(2, 0, 2, 12),
          }],
        },
      }],
      loc: bounds(1, 0, 3, 3),
    });
  });

  it('parses function that returns another function', () => {
    const { block } = parse(`
function f(x)
  return function()
    print(x + 1)
  end
end
`.trim());

    deepEquals(block, {
      type: 'Block',
      body: [{
        type: 'FunctionDeclaration',
        isLocal: false,
        identifier: {
          type: 'Identifier',
          name: 'f',
          loc: bounds(1, 9, 1, 10),
        },
        parameters: [{
          type: 'Identifier',
          name: 'x',
          loc: bounds(1, 11, 1, 12),
        }],
        block: {
          type: 'Block',
          body: [{
            type: 'ReturnStatement',
            arguments: [{
              type: 'FunctionDeclaration',
              isLocal: false,
              parameters: [],
              block: {
                type: 'Block',
                body: [{
                  type: 'CallStatement',
                  expression: {
                    type: 'CallExpression',
                    base: { type: 'Identifier', name: 'print' },
                    arguments: [{
                      type: 'BinaryExpression',
                      operator: '+',
                      left: { type: 'Identifier', name: 'x' },
                      right: { type: 'NumericLiteral', value: 1 },
                    }],
                  },
                }],
              },
            }],
          }],
        },
      }],
    });
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
      block: {
        body: [{
          type: 'ReturnStatement',
          arguments: [],
        }],
      },
    }]);
  });

  it('parses statements ending in semicolon', () => {
    // This is a snippet from Celeste 2 that gave some parser issues. Semicolons
    // are supposed to be fine ... idk why PICO-8 allows them exactly but they
    // shouldn't mess up parsing.
    const text = `
object = {}
object.speed_x = 0;
object.speed_y = 0;
object.remainder_x = 0;
object.remainder_y = 0;
`.trim();
    const result = parse(text);
    deepEquals(result.errors, []);
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

  it('parses if ... then statement', () => {
    const printHiBlock = {
      type: 'Block',
      body: [{
        type: 'CallStatement',
        expression: {
          type: 'CallExpression',
          base: { type: 'Identifier', name: 'print' },
          arguments: [{ type: 'StringLiteral', value: 'hi' }],
        },
      }],
    };

    const input = `
if false then
  print("hi")
  -- end comment 1
elseif false then
  print("hi")
  -- end comment 2
else
  print("hi")
  -- end comment 3
end`.trim();
    deepEqualsAST(input, [{
      type: 'IfStatement',
      clauses: [
        {
          type: 'IfClause',
          condition: { type: 'BooleanLiteral', value: false },
          block: { ...printHiBlock, loc: bounds(2, 2, 4, 6) },
        },
        {
          type: 'ElseifClause',
          condition: { type: 'BooleanLiteral', value: false },
          block: { ...printHiBlock, loc: bounds(5, 2, 7, 4) },
        },
        {
          type: 'ElseClause',
          block: { ...printHiBlock, loc: bounds(8, 2, 10, 3) },
        },
      ],
    }]);
  });

  it('parses if ... do statement', () => {
    const printHiBlock = {
      type: 'Block',
      body: [{
        type: 'CallStatement',
        expression: {
          type: 'CallExpression',
          base: { type: 'Identifier', name: 'print' },
          arguments: [{ type: 'StringLiteral', value: 'hi' }],
        },
      }],
    };

    const input = `
if false do
  print("hi")
  -- end comment 1
elseif false do
  print("hi")
  -- end comment 2
else
  print("hi")
  -- end comment 3
end`.trim();
    deepEqualsAST(input, [{
      type: 'IfStatement',
      clauses: [
        {
          type: 'IfClause',
          condition: { type: 'BooleanLiteral', value: false },
          block: { ...printHiBlock, loc: bounds(2, 2, 4, 6) },
        },
        {
          type: 'ElseifClause',
          condition: { type: 'BooleanLiteral', value: false },
          block: { ...printHiBlock, loc: bounds(5, 2, 7, 4) },
        },
        {
          type: 'ElseClause',
          block: { ...printHiBlock, loc: bounds(8, 2, 10, 3) },
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
          block: {
            body: [{
              type: 'CallStatement',
              expression: {
                type: 'CallExpression',
                base: { type: 'Identifier', name: 'print' },
                arguments: [{ type: 'StringLiteral', value: 'hi' }],
              },
            }],
          },
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
          block: { body: [{ type: 'ReturnStatement', arguments: [] }] },
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

  it('parses one-line if statement with else', () => {
    const input = 'if (false) a() else b = 1';
    const { errors, block: { body } } = parse(input);

    deepEquals(errors, []);

    deepEquals(body, [{
      type: 'IfStatement',
      oneLine: true,
      clauses: [
        {
          type: 'IfClause',
          condition: {},
          block: { body: [{ type: 'CallStatement' }] },
        },
        {
          type: 'ElseClause',
          block: { body: [{ type: 'AssignmentStatement' }] },
        },
      ],
    }]);
  });

  it('parses PICO-8 one-line if statement with significant newline and multiline `else`', () => {
    const input = `
if(v.x<-130) del(b,v) else
  v.x-=2
end
`.trim();

    const { errors, block: { body } } = parse(input);

    deepEquals(errors, []);

    deepEquals(body, [{
      type: 'IfStatement',
      oneLine: true,
      clauses: [
        {
          type: 'IfClause',
          condition: {},
          block: {},
        },
        {
          type: 'ElseClause',
          block: {},
        },
      ],
    }]);
  });

  it('parses a PICO-8 "print" operator (?)', () => {
    // This is the same as print("hi")
    // (Note the argument must be on the same line as the ?)
    const { block: { body }, errors } = parse('?"hi"');
    deepEquals(errors, []);
    deepEquals(body, [
      {
        type: 'CallStatement', expression: {
          type: 'CallExpression',
          base: { type: 'Identifier', name: '?' },
          arguments: [{ type: 'StringLiteral', value: 'hi' }],
        },
      },
    ]);
  });

  it('parses PICO-8 arithmetic operators', () => {
    const code = `a = -a
a = a + b
a = a - b
a = a * b
a = a / b
a = a \\ b -- division + floor
a = a % b  -- modulo
a = a ^ b  -- exponentiation`;
    const { block: { body }, errors } = parse(code);
    deepEquals(errors, []);
    deepEquals(body, [
      { type: 'AssignmentStatement', init: [{ type: 'UnaryExpression', operator: '-' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '+' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '-' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '*' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '/' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '\\' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '%' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '^' }] },
    ]);
  });

  it('parses PICO-8 bitwise operators', () => {
    const code = `
a = ~a -- not
a = a | b -- or
a = a & b -- and
a = a ^^ b -- xor
a = a << b -- shift left
a = a >> b -- arithmetic shift right
a = a >>> b -- logical shift right
a = a <<> b -- rotate left
a = a >>< b -- rotate right`;
    const { block: { body }, errors } = parse(code);
    deepEquals(errors, []);
    deepEquals(body, [
      { type: 'AssignmentStatement', init: [{ type: 'UnaryExpression', operator: '~' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '|' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '&' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '^^' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '<<' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '>>' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '>>>' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '<<>' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '>><' }] },
    ]);
  });

  it('parses PICO-8 memory operators', () => {
    const code = `
a = @a -- peek()
a = %a -- peek2()
a = $a -- peek4()`;
    const { block: { body }, errors } = parse(code);
    deepEquals(errors, []);
    deepEquals(body, [
      { type: 'AssignmentStatement', init: [{ type: 'UnaryExpression', operator: '@' }] },
      { type: 'AssignmentStatement', init: [{ type: 'UnaryExpression', operator: '%' }] },
      { type: 'AssignmentStatement', init: [{ type: 'UnaryExpression', operator: '$' }] },
    ]);
  });

  it('parses PICO-8 relational and misc operators', () => {
    const code = `
a = a < b
a = a > b
a = a <= b
a = a >= b
a = a == b
a = a ~= b
a = a != b -- PICO-8 alias for 'not equals'
a = a and b
a = a or b
a = not a
a = a .. b`;
    const { block: { body }, errors } = parse(code);
    deepEquals(errors, []);
    deepEquals(body, [
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '<' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '>' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '<=' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '>=' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '==' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '~=' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '!=' }] },
      { type: 'AssignmentStatement', init: [{ type: 'LogicalExpression', operator: 'and' }] },
      { type: 'AssignmentStatement', init: [{ type: 'LogicalExpression', operator: 'or' }] },
      { type: 'AssignmentStatement', init: [{ type: 'UnaryExpression', operator: 'not' }] },
      { type: 'AssignmentStatement', init: [{ type: 'BinaryExpression', operator: '..' }] },
    ]);
  });

  it('parses PICO-8 assignment operators', () => {
    const code = `
a += b
a -= b
a *= b
a /= b
a \\= b
a %= b
a ^= b
a ..= b
a |= b
a &= b
a ^^= b
a <<= b
a >>= b
a >>>= b
a <<>= b
a >><= b`;
    const { block: { body }, errors } = parse(code);
    deepEquals(errors, []);
    deepEquals(body, [
      { type: 'AssignmentStatement', operator: '+=' },
      { type: 'AssignmentStatement', operator: '-=' },
      { type: 'AssignmentStatement', operator: '*=' },
      { type: 'AssignmentStatement', operator: '/=' },
      { type: 'AssignmentStatement', operator: '\\=' },
      { type: 'AssignmentStatement', operator: '%=' },
      { type: 'AssignmentStatement', operator: '^=' },
      { type: 'AssignmentStatement', operator: '..=' },
      { type: 'AssignmentStatement', operator: '|=' },
      { type: 'AssignmentStatement', operator: '&=' },
      { type: 'AssignmentStatement', operator: '^^=' },
      { type: 'AssignmentStatement', operator: '<<=' },
      { type: 'AssignmentStatement', operator: '>>=' },
      { type: 'AssignmentStatement', operator: '>>>=' },
      { type: 'AssignmentStatement', operator: '<<>=' },
      { type: 'AssignmentStatement', operator: '>><=' },
    ]);
  });

  describe('? print shorthand', () => {
    it('parses ? with one argument', () => {
      const { block: { body }, errors } = parse('?abc');
      deepEquals(errors, []);
      deepEquals(body, [
        {
          type: 'CallStatement',
          expression: {
            type: 'CallExpression',
            base: {
              type: 'Identifier',
              name: '?',
            },
            arguments: [{
              type: 'Identifier',
              name: 'abc',
            }],
          },
        },
      ]);
    });

    it('parses ? with multiple arguments', () => {
      const { block: { body }, errors } = parse('?abc,\'def\'');
      deepEquals(errors, []);
      deepEquals(body, [
        {
          type: 'CallStatement',
          expression: {
            type: 'CallExpression',
            base: {
              type: 'Identifier',
              name: '?',
            },
            arguments: [
              { type: 'Identifier', name: 'abc' },
              { type: 'StringLiteral', value: 'def' },
            ],
          },
        },
      ]);
    });

    it('parses ? with more complicated args, in context of a function', () => {
      const code = `debug,lmb,rmb=1,0,0
function debug_draw()
  circfill(mx,my,lmb>0 and 2 or 1,7)
  local f,g = flags[fmx+fmy*128], switch[fmx+fmy*128]
  ?fmx.." "..fmy,1,122,12
end`;
      const { errors } = parse(code);
      deepEquals(errors, []);
    });
  });

  it('parses a complicated member expression', () => {
    const { block: { body } } = parse('getInstance().field = "blah"');
    deepEquals(body, [
      {
        type: 'AssignmentStatement', variables: [
          {
            type: 'MemberExpression',
            base: {
              type: 'CallExpression',
              base: { type: 'Identifier', name: 'getInstance' },
              arguments: [],
            },
            indexer: '.',
            identifier: { type: 'Identifier', name: 'field' },
          },
        ], init: [{ type: 'StringLiteral', value: 'blah' }],
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

  it('parses minified pico-8 code without errors - fly', () => {
    const { errors } = parse(getTestFileContents('tweettweetjam-fly.p8'));
    eq(errors.length, 0, 'Unexpected errors: ' + errors.map(e => `[${e.bounds.start.line}:${e.bounds.end.column}] ${e.message}`).join(','));
  });

  it('parses minified pico-8 code without errors - hop', () => {
    const { errors } = parse(getTestFileContents('tweettweetjam-hop.p8'));
    eq(errors.length, 0, 'Unexpected errors: ' + errors.map(e => `[${e.bounds.start.line}:${e.bounds.end.column}] ${e.message}`).join(','));
  });

  it('parses minified pico-8 code without errors - xtris', () => {
    const { errors } = parse(getTestFileContents('tweettweetjam-tet.p8'));
    eq(errors.length, 0, 'Unexpected errors: ' + errors.map(e => `[${e.bounds.start.line}:${e.bounds.end.column}] ${e.message}`).join(','));
  });

  it('parses a binary literal', () => {
    const { block: { body }, errors } = parse('a = 0b0101101001011010.1');
    deepEquals(errors, []);
    deepEquals(body, [
      { type: 'AssignmentStatement', init: [{ type: 'NumericLiteral', raw: '0b0101101001011010.1' }] },
    ]);
  });

  describe('error handling', () => {
    it('handles malformed function definition', () => {
      const { errors } = parse('function[] end');
      deepEquals(errors, [{ message: '<name> expected near \'[\'' }]);
    });

    it('if an error occurs inside a block, it breaks out of the block and continues parsing', () => {
      const { block: { body }, errors } = parse(`
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

  describe('include statement', () => {
    it('parses correct include statement', () => {
      const fileResolver = new MockFileResolver();
      fileResolver.loadFileContents = () => 'local a = 1';

      const { block: { body }, errors } = parse('#include other_file.lua', { includeFileResolver: fileResolver });
      deepEquals(errors, []);
      deepEquals(body, [{ type: 'IncludeStatement' }, { type: 'LocalStatement' }]);
    });

    it('returns error when include statement refers to a file that doesn\'t exist', () => {
      const fileResolver = new MockFileResolver();
      fileResolver.doesFileExist = () => false;

      const { errors } = parse('#include other_file.lua', { includeFileResolver: fileResolver });
      deepEquals(errors, [{ type: 'ParseError' }]);
    });

    it('returns error when include statement refers to a directory', () => {
      const fileResolver = new MockFileResolver();
      fileResolver.isFile = () => false;

      const { errors } = parse('#include other_file.lua', { includeFileResolver: fileResolver });
      deepEquals(errors, [{ type: 'ParseError' }]);
    });

    // I'm not sure we really care to support #includes that only have a partial
    // statement -- seems like it'll get messy real fast and could easily
    // disrupt some of the other analysis that happens. For example, finding the
    // starts/ends of scopes and its interaction with files that are #included
    // seems like it could get complicated very fast.
    //
    // So, although this currently works, it may break in the future. And I feel
    // that it'll be better for the health of this plugin if we just say that
    // #includes only put declarations, etc. into the global scope, and can't
    // affect anything more narrow than that.
    it('handles an include file that contains a partial statement', () => {
      const fileResolver = new MockFileResolver();
      fileResolver.loadFileContents = () => 'a';

      const { block: { body }, errors } = parse('#include other_file.lua\n= 1', { includeFileResolver: fileResolver });
      deepEquals(errors, []);
      deepEquals(body, [{ type: 'IncludeStatement' }, { type: 'AssignmentStatement' }]);
    });

    it('contains no warnings for symbols defined in included files', () => {
      const fileResolver = new MockFileResolver();
      fileResolver.loadFileContents = () => 'local a = 5';

      const { errors, warnings } = parse('#include other_file.lua \n print(a)', { includeFileResolver: fileResolver });
      deepEquals(errors, []);
      deepEquals(warnings, []);
    });
  });

});
