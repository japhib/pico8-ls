import * as fs from 'fs';
import * as path from 'path';
import { strictEqual as eq } from 'assert';
import Lexer from '../lexer';
import Parser from '../parser';
import { Chunk } from '../statements';
import { Token, TokenType, TokenValue } from '../tokens';
import { Bounds } from '../types';

export function getTestFileContents(filename: string): string {
  const filepath = path.join(__dirname, '../../../../testfiles/', filename);
  return fs.readFileSync(filepath).toString();
}

export function getLexedTokens(input: string): Token[] {
  const lexer = new Lexer(input);

  const tokens: Token[] = [];

  do {
    lexer.next();
    tokens.push(lexer.token!);
  } while (lexer.token!.type !== TokenType.EOF);

  return tokens;
}

export function parse(input: string): Chunk {
  return new Parser(input).parseChunk();
}

export function deepEqualsAST(code: string, expected: any) {
  const { body } = parse(code);
  deepEquals(body, expected);
}

export function deepEquals(actual: any, expected: any) {
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

export function locationOfToken(code: string, tokenValue: TokenValue): Bounds {
  const tokens = getLexedTokens(code);
  for (const token of tokens) {
    if (token.value === tokenValue)
      return token.bounds;
  }
  throw new Error(`can't find instance of ${tokenValue} in code!`);
}

export function tokenAt(code: string, index: number): Token | undefined {
  const tokens = getLexedTokens(code);
  for (const token of tokens) {
    if (index >= token.bounds.start.index && index <= token.bounds.end.index)
      return token;
  }
  return undefined;
}
