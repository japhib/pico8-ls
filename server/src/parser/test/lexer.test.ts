import * as assert from 'assert';
import Lexer from '../lexer';
import { Token, TokenType, TokenValue } from '../tokens';

function getLexedTokens(input: string): Token[] {
  const lexer = new Lexer(input);
  const tokens: Token[] = [];

  do {
    lexer.next();
    tokens.push(lexer.token!);
  } while (lexer.token!.type !== TokenType.EOF);

  return tokens;
}

function assertNextToken(tokens: Token[], type: TokenType, value?: TokenValue) {
  if (tokens.length === 0) {
    assert.fail('no more tokens!');
  }

  const token = tokens[0];
  tokens.shift();

  assert.strictEqual(token.type, type);

  if (value !== undefined)
    assert.strictEqual(token.value, value);
}

function assertNoMoreTokens(tokens: Token[]) {
  assertNextToken(tokens, TokenType.EOF);

  if (tokens.length !== 0) {
    assert.fail('extra tokens! ' + tokens.map(t => `${t.type}[${t.value}]`).join(', '));
  }
}

// Asserts we get the right tokens from: `print("hi")`
function assertPrintHi(tokens: Token[]) {
  assertNextToken(tokens, TokenType.Identifier, 'print');
  assertNextToken(tokens, TokenType.Punctuator, '(');
  assertNextToken(tokens, TokenType.StringLiteral, 'hi');
  assertNextToken(tokens, TokenType.Punctuator, ')');
}

describe('Lexer', () => {
  describe('lexes basic lua', () => {
    it('Assignment Statement', () => {
      const tokens = getLexedTokens('i = 1');
      assertNextToken(tokens, TokenType.Identifier, 'i');
      assertNextToken(tokens, TokenType.Punctuator, '=');
      assertNextToken(tokens, TokenType.NumericLiteral, 1);
      assertNoMoreTokens(tokens);
    });

    it('Break Statement', () => {
      const tokens = getLexedTokens('break');
      assertNextToken(tokens, TokenType.Keyword, 'break');
      assertNoMoreTokens(tokens);
    });

    it('Call Statement', () => {
      const tokens = getLexedTokens('somefunc(param1, param2)');
      assertNextToken(tokens, TokenType.Identifier, 'somefunc');
      assertNextToken(tokens, TokenType.Punctuator, '(');
      assertNextToken(tokens, TokenType.Identifier, 'param1');
      assertNextToken(tokens, TokenType.Punctuator, ',');
      assertNextToken(tokens, TokenType.Identifier, 'param2');
      assertNextToken(tokens, TokenType.Punctuator, ')');
      assertNoMoreTokens(tokens);
    });

    it('Do Statement', () => {
      const tokens = getLexedTokens('do print("hi") end');
      assertNextToken(tokens, TokenType.Keyword, 'do');
      assertPrintHi(tokens);
      assertNextToken(tokens, TokenType.Keyword, 'end');
      assertNoMoreTokens(tokens);
    });

    it('ForGeneric Statement', () => {
      const tokens = getLexedTokens('for k, v in pairs(tbl) print("hi") end');
      assertNextToken(tokens, TokenType.Keyword, 'for');
      assertNextToken(tokens, TokenType.Identifier, 'k');
      assertNextToken(tokens, TokenType.Punctuator, ',');
      assertNextToken(tokens, TokenType.Identifier, 'v');
      assertNextToken(tokens, TokenType.Keyword, 'in');
      assertNextToken(tokens, TokenType.Identifier, 'pairs');
      assertNextToken(tokens, TokenType.Punctuator, '(');
      assertNextToken(tokens, TokenType.Identifier, 'tbl');
      assertNextToken(tokens, TokenType.Punctuator, ')');
      assertPrintHi(tokens);
      assertNextToken(tokens, TokenType.Keyword, 'end');
      assertNoMoreTokens(tokens);
    });

    it('ForNumeric Statement', () => {
      const tokens = getLexedTokens('for i=1,10,2 print("hi") end');
      assertNextToken(tokens, TokenType.Keyword, 'for');
      assertNextToken(tokens, TokenType.Identifier, 'i');
      assertNextToken(tokens, TokenType.Punctuator, '=');
      assertNextToken(tokens, TokenType.NumericLiteral, 1);
      assertNextToken(tokens, TokenType.Punctuator, ',');
      assertNextToken(tokens, TokenType.NumericLiteral, 10);
      assertNextToken(tokens, TokenType.Punctuator, ',');
      assertNextToken(tokens, TokenType.NumericLiteral, 2);
      assertPrintHi(tokens);
      assertNextToken(tokens, TokenType.Keyword, 'end');
      assertNoMoreTokens(tokens);
    });

    it('Goto Statement', () => {
      const tokens = getLexedTokens('goto lbl');
      assertNextToken(tokens, TokenType.Keyword, 'goto');
      assertNextToken(tokens, TokenType.Identifier, 'lbl');
      assertNoMoreTokens(tokens);
    });

    it('If Statement', () => {
      const tokens = getLexedTokens('if false then print("hi") elseif false then print("hi") else print("hi")');
      assertNextToken(tokens, TokenType.Keyword, 'if');
      assertNextToken(tokens, TokenType.BooleanLiteral, false);
      assertNextToken(tokens, TokenType.Keyword, 'then');
      assertPrintHi(tokens);
      assertNextToken(tokens, TokenType.Keyword, 'elseif');
      assertNextToken(tokens, TokenType.BooleanLiteral, false);
      assertNextToken(tokens, TokenType.Keyword, 'then');
      assertPrintHi(tokens);
      assertNextToken(tokens, TokenType.Keyword, 'else');
      assertPrintHi(tokens);
      assertNoMoreTokens(tokens);
    });

    it('Label Statement', () => {
      const tokens = getLexedTokens('::lbl::');
      assertNextToken(tokens, TokenType.Punctuator, '::');
      assertNextToken(tokens, TokenType.Identifier, 'lbl');
      assertNextToken(tokens, TokenType.Punctuator, '::');
      assertNoMoreTokens(tokens);
    });

    it('Local Statement', () => {
      const tokens = getLexedTokens('local a = 1');
      assertNextToken(tokens, TokenType.Keyword, 'local');
      assertNextToken(tokens, TokenType.Identifier, 'a');
      assertNextToken(tokens, TokenType.Punctuator, '=');
      assertNextToken(tokens, TokenType.NumericLiteral, 1);
      assertNoMoreTokens(tokens);
    });

    it('Repeat Statement', () => {});

    it('Return Statement', () => {});

    it('While Statement', () => {});
  });
});