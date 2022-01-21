// As this parser is a bit different from luas own, the error messages
// will be different in some situations.

import { Token } from './tokens';
import { LocationExt } from './types';
import { sprintf } from './util';

export const errMessages = Object.freeze({
  unexpected: 'unexpected %1 \'%2\' near \'%3\'',
  unexpectedEOF: 'unexpected symbol near \'<eof>\'',
  expected: '\'%1\' expected near \'%2\'',
  expectedToken: '%1 expected near \'%2\'',
  unfinishedString: 'unfinished string near \'%1\'',
  malformedNumber: 'malformed number near \'%1\'',
  decimalEscapeTooLarge: 'decimal escape too large near \'%1\'',
  invalidEscape: 'invalid escape sequence near \'%1\'',
  hexadecimalDigitExpected: 'hexadecimal digit expected near \'%1\'',
  braceExpected: 'missing \'%1\' near \'%2\'',
  tooLargeCodepoint: 'UTF-8 value too large near \'%1\'',
  unfinishedLongString: 'unfinished long string (starting at line %1) near \'%2\'',
  unfinishedLongComment: 'unfinished long comment (starting at line %1) near \'%2\'',
  ambiguousSyntax: 'ambiguous syntax (function call x new statement) near \'%1\'',
  noLoopToBreak: 'no loop to break near \'%1\'',
  labelAlreadyDefined: 'label \'%1\' already defined on line %2',
  labelNotVisible: 'no visible label \'%1\' for <goto>',
  gotoJumpInLocalScope: '<goto %1> jumps into the scope of local \'%2\'',
  cannotUseVararg: 'cannot use \'...\' outside a Vararg function near \'%1\'',
  invalidCodeUnit: 'code unit U+%1 is not allowed in the current encoding mode',
});

export class ParseError extends Error {
  type = 'ParseError';
  message: string;
  location: LocationExt;

  constructor(message: string, location: LocationExt) {
    super();
    this.message = message;
    this.location = location;
  }
}

export function isSyntaxError(e: any): e is ParseError {
  return typeof(e) == 'object' && e.type == 'ParseError';
}

// #### Raise an exception.
//
// Raise an exception by passing a token, a string format and its paramters.
//
// The passed tokens location will automatically be added to the error
// message if it exists, if not it will default to the lexers current
// position.
//
// Example:
//
//     // [1:0] expected [ near (
//     raise(token, "expected %1 near %2", '[', token.value);

export function raiseErr(loc: LocationExt, fmtMessage: string, ...rest: any[]): never {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const message = sprintf(fmtMessage, ...rest);
  const error = new ParseError(sprintf('[%1:%2] %3', loc.line, loc.column, message), loc);
  throw error;
}

export function raiseErrForToken(token: Token, fmtMessage: string, ...rest: any[]): never {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const message = sprintf(fmtMessage, ...rest);
  let col = 0;

  col = token.range[0] - token.lineStart;
  const error = new ParseError(sprintf('[%1:%2] %3', token.line, col, message), {index: token.index, line: token.line, column: col});
  throw error;
}

// #### Raise an unexpected token error.
//
// Example:
//
//     // expected <name> near '0'
//     raiseUnexpectedToken('<name>', token);

export function raiseUnexpectedToken(type: string, token: Token): never {
  raiseErrForToken(token, errMessages.expectedToken, type, token.value);
}
