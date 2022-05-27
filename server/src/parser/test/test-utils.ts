import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { fail } from 'assert';
import Lexer from '../lexer';
import Parser from '../parser';
import { Chunk } from '../statements';
import { Token, TokenType, TokenValue } from '../tokens';
import { Bounds } from '../types';
import ResolvedFile, { FileResolver } from '../file-resolver';

export function getTestFileContents(filename: string): string {
  const filepath = path.join(__dirname, '../../../../testfiles/', filename);
  return fs.readFileSync(filepath).toString();
}

export function getLexedTokens(input: string): Token[] {
  const lexer = new Lexer(input, new ResolvedFile('test', 'test'));

  const tokens: Token[] = [];

  do {
    lexer.next();
    tokens.push(lexer.token!);
  } while (lexer.token!.type !== TokenType.EOF);

  return tokens;
}

export function parse(input: string, dontAddGlobalSymbols?: boolean, includeFileResolver?: FileResolver): Chunk {
  return new Parser(new ResolvedFile('test', 'test'), input, includeFileResolver, dontAddGlobalSymbols).parseChunk();
}

export function deepEqualsAST(code: string, expected: any) {
  const { body } = parse(code);
  deepEquals(body, expected);
}

export function deepEquals(actual: any, expected: any) {
  if (!_deepEquals(actual, expected)) {
    fail(`Objects are not equal!\n\nexpected:\n${util.inspect(expected, { depth: 90 })}\n\nactual:\n${util.inspect(actual, { depth: 90 })}`);
  }
}

function _deepEquals(actual: any, expected: any): boolean {
  if (typeof actual !== typeof expected) {
    return false;
  }

  if (typeof expected === 'object') {
    if (Array.isArray(expected)) {
      return _deepEqualsArray(actual, expected);
    } else {
      return _deepEqualsObject(actual, expected);
    }
  } else {
    if (actual !== expected) {
      return false;
    } else {
      return true;
    }
  }
}

function _deepEqualsArray(actual: any[], expected: any[]): boolean {
  if (actual.length !== expected.length) {
    return false;
  }

  for (let i = 0; i < expected.length; i++) {
    if (!_deepEquals(actual[i], expected[i])) {
      return false;
    }
  }

  return true;
}

function _deepEqualsObject(actual: any, expected: any): boolean {
  for (const key of Object.keys(expected)) {
    if (!_deepEquals(actual[key], expected[key])) {
      return false;
    }
  }

  return true;
}

export function locationOfToken(code: string, tokenValue: TokenValue): Bounds {
  const tokens = getLexedTokens(code);
  for (const token of tokens) {
    if (token.value === tokenValue) {
      return token.bounds;
    }
  }
  throw new Error(`can't find instance of ${tokenValue} in code!`);
}

export function tokenAt(code: string, index: number): Token | undefined {
  const tokens = getLexedTokens(code);
  for (const token of tokens) {
    if (index >= token.bounds.start.index && index <= token.bounds.end.index) {
      return token;
    }
  }
  return undefined;
}

// Not a *real* Bounds object because it's missing index. Useful for making
// something to test against though.
export function bounds(startLine: number, startCol: number, endLine: number, endCol: number) {
  return {
    start: { line: startLine, column: startCol },
    end: { line: endLine, column: endCol },
  };
}

export class MockFileResolver implements FileResolver {
  doesFileExist: (filepath: string) => boolean;
  isFile: (filepath: string) => boolean;
  loadFileContents: (filepath: string) => string;

  constructor() {
    this.doesFileExist = this.defaultDoesFileExist.bind(this);
    this.isFile = this.defaultIsFile.bind(this);
    this.loadFileContents = this.defaultLoadFileContents.bind(this);
  }

  private defaultDoesFileExist(_filepath: string): boolean {
    return true;
  }

  private defaultIsFile(_filepath: string): boolean {
    return true;
  }

  private defaultLoadFileContents(_filepath: string): string {
    return '';
  }
}
