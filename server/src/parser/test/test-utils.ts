import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { fail } from 'assert';
import Lexer from '../lexer';
import Parser from '../parser';
import { Token, TokenType, TokenValue } from '../tokens';
import { Bounds } from '../types';
import ResolvedFile, { FileResolver } from '../file-resolver';
import { DefinitionsUsagesResult, DefUsageScope, findDefinitionsUsages } from '../definitions-usages';
import { Chunk } from '../statements';

export function getTestFileContents(filename: string): string {
  const filepath = path.join(__dirname, '../../../../testfiles/', filename);
  return fs.readFileSync(filepath).toString();
}

export function getLexedTokens(input: string): Token[] {
  const lexer = new Lexer(input, new ResolvedFile('main_test_file', 'main_test_file'));

  const tokens: Token[] = [];

  do {
    lexer.next();
    tokens.push(lexer.token!);
  } while (lexer.token!.type !== TokenType.EOF);

  return tokens;
}

export function parse(
  input: string,
  dontAddGlobalSymbols?: boolean,
  includeFileResolver?: FileResolver,
  injectedGlobalScope?: DefUsageScope,
  filename?: string,
): Chunk & DefinitionsUsagesResult {
  filename = filename || 'main_test_file';
  const chunk = new Parser(new ResolvedFile(filename, filename), input, includeFileResolver, dontAddGlobalSymbols).parseChunk();
  const defUsResult = findDefinitionsUsages(chunk, dontAddGlobalSymbols, injectedGlobalScope);
  return {
    ...chunk,
    ...defUsResult,
  };
}

export function deepEqualsAST(code: string, expected: any) {
  const { block: { body } } = parse(code);
  deepEquals(body, expected);
}

export function deepEquals(actual: any, expected: any, options: DeepEqualsOptions = {}) {
  const result = _deepEquals(actual, expected, 'root', options);
  if (!result.matches) {
    fail(
      'Objects are not equal!\n\n' +
      `Mismatch: ${result.location}\n\n` +
      'expected:\n' +
      util.inspect(expected, { depth: 90, colors: true }) +
      '\n\n' +
      'actual:\n' +
      util.inspect(actual, { depth: 90, colors: true }),
    );
  }
}

type DeepEqualsOptions = {
  objectKeyOmitFn?: (key: any) => boolean,
  arrayItemOmitFn?: (item: any) => boolean,
};

type DeepEqualsResult = {
  matches: boolean,
  location?: string,
};

function _deepEquals(actual: any, expected: any, currLocStr: string, options: DeepEqualsOptions): DeepEqualsResult {
  if (typeof actual !== typeof expected) {
    return {
      matches: false,
      location: `${currLocStr}.[typeof(actual:${typeof actual},expected:${typeof expected})]`,
    };
  }

  if (expected === null || expected === undefined) {
    return {
      matches: expected === actual,
      location: `${currLocStr}.[===] (expected: ${expected}, actual: ${actual})`,
    };
  } else if (typeof expected === 'object') {
    if (Array.isArray(expected)) {
      return _deepEqualsArray(actual, expected, currLocStr, options);
    } else {
      return _deepEqualsObject(actual, expected, currLocStr, options);
    }
  } else {
    if (actual !== expected) {
      return {
        matches: false,
        location: `${currLocStr}.[===] (expected: ${expected}, actual: ${actual})`,
      };
    } else {
      return { matches: true };
    }
  }
}

function _deepEqualsArray(actual: any[], expected: any[], currLocStr: string, options: DeepEqualsOptions): DeepEqualsResult {
  const filteredActual = actual.filter(item => !options.arrayItemOmitFn?.(item));
  const filteredExpected = expected.filter(item => !options.arrayItemOmitFn?.(item));
  if (filteredActual.length !== filteredExpected.length) {
    return {
      matches: false,
      location: `${currLocStr}.[length(actual:${filteredActual.length},expected:${filteredExpected.length})]`,
    };
  }

  for (let i = 0; i < filteredExpected.length; i++) {
    const subResult = _deepEquals(filteredActual[i], filteredExpected[i], `${currLocStr}.${i}`, options);
    if (!subResult.matches) {
      return subResult;
    }
  }

  return { matches: true };
}

function _deepEqualsObject(actual: any, expected: any, currLocStr: string, options: DeepEqualsOptions): DeepEqualsResult {
  const keysToCheck = Object.keys(expected).filter(key => !(options.objectKeyOmitFn?.(key)));
  for (const key of keysToCheck) {
    const subResult = _deepEquals(actual && actual[key], expected[key], `${currLocStr}.${key}`, options);
    if (!subResult.matches) {
      return subResult;
    }
  }

  return { matches: true };
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
