import AST from './ast';
import { EncodingMode, encodingModes, EncodingModeType } from './encoding-modes';
import * as errors from './errors';
import { errMessages } from './errors';
import { Comment_, DocComment } from './expressions';
import ResolvedFile from './file-resolver';
import { Token, TokenType, TokenValue } from './tokens';
import { Bounds, CodeLocation } from './types';

// Lexer
// -----
//
// The lexer, or the tokenizer reads the input string character by character
// and derives a token left-right. To be as efficient as possible the lexer
// prioritizes the common cases such as identifiers. It also works with
// character codes instead of characters as string comparisons was the
// biggest bottleneck of the parser.
//
// If `options.comments` is enabled, all comments encountered will be stored
// in an array which later will be appended to the chunk object. If disabled,
// they will simply be disregarded.
//
// When the lexer has derived a valid token, it will be returned as an object
// containing its value and as well as its position in the input string (this
// is always enabled to provide proper debug messages).
//
// `lex()` starts lexing and returns the following token in the stream.
export default class Lexer {
  charCode: number = 0;
  peekCharCodeindex: number = 0;

  // where we currently are
  index: number = 0;
  line: number = 1;
  // Index where the current line started
  lineStart: number = 0;

  // Keep track of where the current token started
  tokenStart: number = 0; // index
  tokenStartLine: number = 0; // line
  // index of the current token start of line (for multi-line tokens like string
  // literal)
  tokenStartLineIdx: number = 0;

  comments: (Comment_ | DocComment)[] = [];
  lookahead: Token | undefined;
  previousToken: Token | undefined;
  token: Token | undefined;
  fullP8File: boolean = false;
  reachedEnd: boolean = false;

  input: string = '';
  length: number = 0;
  encodingMode: EncodingMode = encodingModes[EncodingModeType.XUserDefined];

  // Special flag that indicates we shouldn't skip over a newline, instead
  // treating it as a special newline token. This is useful for the special
  // PICO-8 one-line if statement.
  newlineSignificant: boolean = false;

  filename: ResolvedFile;

  constructor(input: string, filename: ResolvedFile) {
    this.input = input;
    this.length = this.input.length;
    this.filename = filename;

    // prime the pump
    this.skipHeader();
  }

  skipHeader() {
    if (this.input.startsWith('pico-8 cartridge')) {
      this.fullP8File = true;

      // skip lines until we get to __lua__
      while (this.index < this.length && this.currentLine() !== '__lua__') {
        this.skipLine();
      }

      // Skip the __lua__ line
      this.skipLine();
    }
  }

  currentLine(): string {
    let i = this.lineStart;
    // look for \r and \n
    while (i < this.length && this.input.charCodeAt(i) != 10 && this.input.charCodeAt(i) != 13) {
      i++;
    }

    return this.input.substring(this.lineStart, i);
  }

  skipLine() {
    while (this.index < this.length) {
      const charCode = this.input.charCodeAt(this.index);
      if (isLineTerminator(charCode)) {
        // skip the newline character(s)
        this.consumeEOL();
        break;
      } else {
        this.index++;
      }
    }
  }

  withSignificantNewline(func: (() => void)) {
    this.newlineSignificant = true;
    try {
      func();
    } finally {
      // This goes in 'finally' so it doesn't corrupt the state if there's
      // an error during parsing

      // Consume the significant newline
      if (this.token!.type === TokenType.Newline) {
        this.next();
      }

      this.newlineSignificant = false;
    }
  }

  // #### Raise a general unexpected error
  //
  // Usage should pass either a token object or a symbol string which was
  // expected. We can also specify a nearby token such as <eof>, this will
  // default to the currently active token.
  //
  // Example:
  //
  //     // Unexpected symbol 'end' near '<eof>'
  //     unexpected(token);
  //
  // If there's no token in the buffer it means we have reached <eof>.

  unexpectedToken(found: Token): never {
    const near = this.lookahead!.value;

    let type;
    switch (found.type) {
    case TokenType.StringLiteral:   type = 'string';      break;
    case TokenType.Keyword:         type = 'keyword';     break;
    case TokenType.Identifier:      type = 'identifier';  break;
    case TokenType.NumericLiteral:  type = 'number';      break;
    case TokenType.Punctuator:      type = 'symbol';      break;
    case TokenType.BooleanLiteral:  type = 'boolean';     break;
    case TokenType.NilLiteral:
      errors.raiseErrForToken(found, errMessages.unexpected, 'symbol', 'nil', near);
      break;
    case TokenType.EOF:
      errors.raiseErrForToken(found, errMessages.unexpectedEOF);
      break;
    }

    errors.raiseErrForToken(found, errMessages.unexpected, type, found.value, near);
  }

  unexpectedString(found: string): never {
    const near = this.lookahead?.value;
    this.raiseErr(errMessages.unexpected, 'symbol', found, near);
  }

  raiseErr(fmtMessage: string, ...rest: any[]): never {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    errors.raiseErr(this.getCurrentBounds(), fmtMessage, ...rest);
  }

  getLocation(): CodeLocation {
    return {
      index: this.index,
      line: this.line,
      column: this.index - this.lineStart + 1,
      filename: this.filename,
    };
  }

  getCurrentBounds(): Bounds {
    return {
      start: {
        index: this.tokenStart,
        line: this.tokenStartLine,
        column: this.tokenStart - this.tokenStartLineIdx,
        filename: this.filename,
      },
      end: {
        index: this.index,
        line: this.line,
        column: this.index - this.lineStart,
        filename: this.filename,
      },
    };
  }

  makeToken(type: TokenType, value: TokenValue, docComment?: string): Token {
    return {
      type: type,
      value: value,
      bounds: this.getCurrentBounds(),
      docComment : docComment,
    };
  }

  lex(): Token {
    if (this.reachedEnd) {
      return this.makeToken(TokenType.EOF, '<eof>');
    }

    this.skipWhiteSpace();

    let lastDocComment : Comment_ | DocComment | undefined = undefined;

    const commentBlock : Comment_[] = [];
    while (
      // Skip comments beginning with --
      (45 === this.input.charCodeAt(this.index) && 45 === this.input.charCodeAt(this.index + 1))
      // (pico-8 specific) Also skip comments beginning with `//`
      || (47 === this.input.charCodeAt(this.index) && 47 === this.input.charCodeAt(this.index + 1))
    ) {
      const canBeLongComment = 45 === this.input.charCodeAt(this.index);
      const node = this.scanComment(canBeLongComment);
      commentBlock.push(node);
      this.skipWhiteSpace();
    }
    if (commentBlock.length) {

      //TODO: go through all comments and group any short comments together
      /*
        [
          1: [node, node],
          2: [node],
          3: [node, node, node]
        ]
      */

      const _groupedComments = commentBlock
        .reduce((a:Comment_[][], c) :Comment_[][] => {
          //start here if totally empty
          if (!a.length) {
            a.push([ c ]);
            return a;
          }

          if (a[a.length-1][0].type == 'Comment' && c.type == 'Comment') {
            // ok not empty so let's compare to last item and if they're both short
            // comments, just add it to the inner array
            a[a.length-1].push(c);
          } else {
            // other wise add as a root item
            a.push([ c ]);
          }

          return a;
        }, [])
        .map((gc) : Comment_ | DocComment => {
          // merge grouped nodes into single nodes and convert to DocComment where applicable
          if (gc.length == 1) {
            const isDocComment = gc[0].value.replace('\r\n', '\n').split('\n').every(line=>line.startsWith('-'));

            if (isDocComment) {
              const n = AST.docComment(gc[0].value, gc[0].raw); //rewrite as doccomment type
              n.loc = gc[0].loc;
              return n;
            } else {
              return gc[0]; // return the comment already defined
            }
          } else {
            const value = gc.map(gc=>gc.value).join('\n');
            const raw = gc.map(gc=>gc.raw).join('\n'); //TODO: Check if EOL chars are stored
            const isDocComment = value.replace('\r\n', '\n').split('\n').every(line=>line.startsWith('-'));

            if (isDocComment) {
              const n = AST.docComment(value, raw); //rewrite as doccomment type
              n.loc = { start: gc[0].loc!.start, end: gc[gc.length-1].loc!.end };
              return n;
            } else {
              const n = AST.comment(value, raw); //rewrite as doccomment type
              n.loc = { start: gc[0].loc!.start, end: gc[gc.length-1].loc!.end };
              return n;
            }
          }
        });

      //TODO: add all comments to this.comments
      _groupedComments.forEach(gc=>this.comments.push(gc));
      //TODO: add the last comment "block" as the last doccomment
      if (_groupedComments[_groupedComments.length-1].type == 'DocComment') {
        lastDocComment = _groupedComments[_groupedComments.length-1];
      }
    }

    console.log('lastDocComment', lastDocComment);

    if (this.index >= this.length) {
      return this.makeToken(TokenType.EOF, '<eof>');
    }

    const charCode = this.input.charCodeAt(this.index);
    const next = this.input.charCodeAt(this.index + 1);

    // Memorize the range index where the token begins.
    this.tokenStart = this.index;
    this.tokenStartLine = this.line;
    this.tokenStartLineIdx = this.lineStart;
    if (isIdentifierStart(charCode)) {
      return this.scanIdentifierOrKeyword(lastDocComment);
    }

    switch (charCode) {
    case 39: case 34: // '"
      return this.scanStringLiteral();

    case 48: case 49: case 50: case 51: case 52: case 53:
    case 54: case 55: case 56: case 57: // 0-9
      return this.scanNumericLiteral();

    case 46: // .
      // If the dot is followed by a digit it's a float.
      if (isDecDigit(next)) {
        return this.scanNumericLiteral();
      }
      if (46 === next) {
        const uberNext = this.input.charCodeAt(this.index + 2);
        if (61 === uberNext) {
          return this.scanPunctuator('..=');
        }
        if (46 === uberNext) {
          return this.scanVarargLiteral();
        }
        return this.scanPunctuator('..');
      }
      return this.scanPunctuator('.');

    case 61: // =
      if (61 === next) {
        return this.scanPunctuator('==');
      }
      return this.scanPunctuator('=');

    case 62: // >, >=, >>, >>= (arithmetic right shift), >>>, >>>= (logical right shift), >><, >><= (rotate right)
      if (62 === next) { // it's one of >>, >>=, >>>, >>>=, >><, >><=
        const uberNext = this.input.charCodeAt(this.index + 2);
        if (61 === uberNext) {
          return this.scanPunctuator('>>=');
        }
        if (62 === uberNext) { // it's >>> or >>>=
          if (this.input.charCodeAt(this.index + 3) === 61) {
            return this.scanPunctuator('>>>=');
          }
          return this.scanPunctuator('>>>');
        }
        if (60 === uberNext) { // it's >>< or >><=
          if (this.input.charCodeAt(this.index + 3) === 61) {
            return this.scanPunctuator('>><=');
          }
          return this.scanPunctuator('>><');
        }
        if (62 === next) {
          return this.scanPunctuator('>>');
        }
      }
      if (61 === next) {
        return this.scanPunctuator('>=');
      }
      return this.scanPunctuator('>');

    case 60: // <, <=, <<, <<= (left shift), <<>, <<>= (rotate left)
      if (60 === next) { // it's <<, <<=, <<>, or <<>=
        const uberNext = this.input.charCodeAt(this.index + 2);
        if (61 === uberNext) {
          return this.scanPunctuator('<<=');
        }
        if (62 === uberNext) { // 62 is >
          if (this.input.charCodeAt(this.index + 3) === 61) {
            return this.scanPunctuator('<<>=');
          }
          return this.scanPunctuator('<<>');
        }
        return this.scanPunctuator('<<');
      }
      if (61 === next) {
        return this.scanPunctuator('<=');
      }
      return this.scanPunctuator('<');

    case 126: // ~
      if (61 === next) {
        return this.scanPunctuator('~=');
      }
      return this.scanPunctuator('~');

    case 58: // :
      if (58 === next) {
        return this.scanPunctuator('::');
      }
      return this.scanPunctuator(':');

    case 91: // [
      // Check for a multiline string, they begin with [= or [[
      if (91 === next || 61 === next) {
        return this.scanLongStringLiteral();
      }
      return this.scanPunctuator('[');

    case 94: // ^, ^= (exponentiation), ^^, ^^= (xor)
      if (61 === next) {
        return this.scanPunctuator('^=');
      }
      if (94 === next) {
        if (61 === this.input.charCodeAt(this.index + 2)) {
          return this.scanPunctuator('^^=');
        }
        return this.scanPunctuator('^^');
      }
      return this.scanPunctuator('^');

    case 33: // != only (solitary ! is not allowed)
      return this.scanPunctuator('!=');

    // Check for assignment operators (+=, etc.)
    case 37: // %
    case 38: // &
    case 42: // *
    case 43: // +
    case 45: // -
    case 47: // /
    case 92: // \
    case 124: // |
      if (61 === next) {
        return this.scanPunctuator(this.input.charAt(this.index) + '=');
      }
      return this.scanPunctuator(this.input.charAt(this.index));

    case 35: // #
    case 36: // $
    case 40: // (
    case 41: // )
    case 44: // ,
    case 59: // ;
    case 63: // ?
    case 64: // @
    case 93: // ]
    case 123: // {
    case 125: // }
      return this.scanPunctuator(this.input.charAt(this.index));
    }

    this.unexpectedString(this.input.charAt(this.index));
  }

  // Whitespace has no semantic meaning in lua so simply skip ahead while
  // tracking the encounted newlines. Any kind of eol sequence is counted as a
  // single line.
  consumeEOL() {
    const charCode = this.input.charCodeAt(this.index);
    const peekCharCode = this.input.charCodeAt(this.index + 1);

    if (isLineTerminator(charCode)) {
      // Count \n\r and \r\n as one newline.
      let forward = 1;
      if (10 === charCode && 13 === peekCharCode) {
        this.peekCharCodeindex++; forward = 2;
      }
      if (13 === charCode && 10 === peekCharCode) {
        this.peekCharCodeindex++; forward = 2;
      }
      this.index += forward;

      this.line++;
      this.lineStart = this.index;
      return true;
    }
    return false;
  }

  skipWhiteSpace() {
    while (this.index < this.length) {
      const charCode = this.input.charCodeAt(this.index);
      if (isWhiteSpace(charCode)) {
        this.index++;
      } else if (!this.consumeEOL()) {
        break;
      }
    }
  }

  // Identifiers, keywords, booleans and nil all look the same syntax wise. We
  // simply go through them one by one and defaulting to an identifier if no
  // previous case matched.

  scanIdentifierOrKeyword(lastDocComment?: Comment_ | DocComment): Token {
    let value, type;

    // Slicing the input string is prefered before string concatenation in a
    // loop for performance reasons.
    while (isIdentifierPart(this.input.charCodeAt(this.index))) {
      this.index++;
    }
    value = this.encodingMode.fixup(this.getLocation(), this.input.slice(this.tokenStart, this.index));

    // Decide on the token type and possibly cast the value.
    if (isKeyword(value)) {
      type = TokenType.Keyword;
    } else if ('true' === value || 'false' === value) {
      type = TokenType.BooleanLiteral;
      value = ('true' === value);
    } else if ('nil' === value) {
      type = TokenType.NilLiteral;
      value = null;
    } else if (isP8EndOfCodeSection(value)
        && this.lineStart === this.tokenStart // has to be the only thing on the line
        && isLineTerminator(this.input.charCodeAt(this.index))) {
      this.reachedEnd = true;
      type = TokenType.EOF;
    } else {
      type = TokenType.Identifier;
    }

    return this.makeToken(type, value, lastDocComment?.value);
  }

  // Once a punctuator reaches this function it should already have been
  // validated so we simply return it as a token.
  scanPunctuator(value: string): Token {
    this.index += value.length;
    return this.makeToken(TokenType.Punctuator, value);
  }

  // A Vararg literal consists of three dots.

  scanVarargLiteral(): Token {
    this.index += 3; // ...
    return this.makeToken(TokenType.VarargLiteral, '...');
  }

  // Find the string literal by matching the delimiter marks used.

  scanStringLiteral(): Token {
    const delimiter = this.input.charCodeAt(this.index++);

    let stringStart = this.index;
    let string = this.encodingMode.discardStrings ? null : '';

    for (;;) {
      this.charCode = this.input.charCodeAt(this.index++);
      if (delimiter === this.charCode) {
        break;
      }
      // EOF or `\n` terminates a string literal. If we haven't found the
      // ending delimiter by now, raise an exception.
      if (this.index > this.length || isLineTerminator(this.charCode)) {
        string += this.input.slice(stringStart, this.index - 1);

        // Get ready for next time lex() is called
        if (isLineTerminator(this.charCode)) {
          this.consumeEOL();
        }

        this.raiseErr(errMessages.unfinishedString, this.input.slice(this.tokenStart, this.index - 1));
      }
      if (92 === this.charCode) { // backslash
        if (!this.encodingMode.discardStrings) {
          const beforeEscape = this.input.slice(stringStart, this.index - 1);
          string += this.encodingMode.fixup(this.getLocation(), beforeEscape);
        }
        const escapeValue = this.readEscapeSequence();
        if (!this.encodingMode.discardStrings) {
          string += escapeValue;
        }
        stringStart = this.index;
      }
    }
    if (!this.encodingMode.discardStrings) {
      string += this.encodingMode.encodeByte(null);
      string += this.encodingMode.fixup(this.getLocation(), this.input.slice(stringStart, this.index - 1));
    }

    return this.makeToken(TokenType.StringLiteral, string);
  }

  // Expect a multiline string literal and return it as a regular string
  // literal, if it doesn't validate into a valid multiline string, throw an
  // exception.

  scanLongStringLiteral(): Token {
    const string = this.readLongString(false);
    // Fail if it's not a multiline literal.
    if (false === string) {
      errors.raiseErrForToken(this.token!, errMessages.expected, '[', this.token!.value);
    }

    return this.makeToken(
      TokenType.StringLiteral,
      this.encodingMode.discardStrings ? null : this.encodingMode.fixup(this.getLocation(), string),
    );
  }

  // Numeric literals will be returned as floating-point numbers instead of
  // strings. The raw value should be retrieved from slicing the input string
  // later on in the process.
  //
  // If a hexadecimal number is encountered, it will be converted.

  scanNumericLiteral(): Token {
    const character = this.input.charAt(this.index);
    const next = this.input.charAt(this.index + 1);

    let literal = undefined;
    if (character === '0') {
      if ([ 'x', 'X' ].includes(next)) {
        literal = this.readHexLiteral();
      } else if ([ 'b', 'B' ].includes(next)) {
        literal = this.readBinaryLiteral();
      }
    }

    if (literal === undefined) {
      // If we didn't already read hex or binary literal, it must be decimal
      literal = this.readDecLiteral();
    }

    return this.makeToken(TokenType.NumericLiteral, literal.value);
  }

  // Lua hexadecimals have an optional fraction part and an optional binary
  // exoponent part. These are not included in JavaScript so we will compute
  // all three parts separately and then sum them up at the end of the function
  // with the following algorithm.
  //
  //     Digit := toDec(digit)
  //     Fraction := toDec(fraction) / 16 ^ fractionCount
  //     BinaryExp := 2 ^ binaryExp
  //     Number := ( Digit + Fraction ) * BinaryExp

  readHexLiteral() {
    let fraction = 0, // defaults to 0 as it gets summed
      binaryExponent = 1, // defaults to 1 as it gets multiplied
      binarySign = 1, // positive
      fractionStart, exponentStart;

    const digitStart = this.index += 2; // Skip 0x part

    // A minimum of one hex digit is required.
    if (!isHexDigit(this.input.charCodeAt(this.index))) {
      this.raiseErr(errMessages.malformedNumber, this.input.slice(this.tokenStart, this.index));
    }

    while (isHexDigit(this.input.charCodeAt(this.index))) {
      ++this.index;
    }
    // Convert the hexadecimal digit to base 10.
    const digit = parseInt(this.input.slice(digitStart, this.index), 16);

    // Fraction part is optional.
    let foundFraction = false;
    if ('.' === this.input.charAt(this.index)) {
      foundFraction = true;
      fractionStart = ++this.index;

      while (isHexDigit(this.input.charCodeAt(this.index))) {
        ++this.index;
      }
      const fracStr = this.input.slice(fractionStart, this.index);

      // Empty fraction parts should default to 0, others should be converted
      // 0.x form so we can use summation at the end.
      fraction = (fractionStart === this.index) ? 0
        : parseInt(fracStr, 16) / Math.pow(16, this.index - fractionStart);
    }

    // Binary exponents are optional
    let foundBinaryExponent = false;
    if ([ 'p', 'P' ].includes(this.input.charAt(this.index))) {
      foundBinaryExponent = true;
      ++this.index;

      // Sign part is optional and defaults to 1 (positive).
      if ([ '+', '-' ].includes(this.input.charAt(this.index))) {
        binarySign = ('+' === this.input.charAt(this.index++)) ? 1 : -1;
      }

      exponentStart = this.index;

      // The binary exponent sign requires a decimal digit.
      if (!isDecDigit(this.input.charCodeAt(this.index))) {
        this.raiseErr(errMessages.malformedNumber, this.input.slice(this.tokenStart, this.index));
      }

      while (isDecDigit(this.input.charCodeAt(this.index))) {
        ++this.index;
      }
      binaryExponent = +this.input.slice(exponentStart, this.index);

      // Calculate the binary exponent of the number.
      binaryExponent = Math.pow(2, binaryExponent * binarySign);
    }

    return {
      value: (digit + fraction) * binaryExponent,
      hasFractionPart: foundFraction || foundBinaryExponent,
    };
  }

  // Decimal numbers are exactly the same in Lua and in JavaScript, because of
  // this we check where the token ends and then parse it with native
  // functions.

  readDecLiteral() {
    while (isDecDigit(this.input.charCodeAt(this.index))) {
      ++this.index;
    }

    // Fraction part is optional
    let foundFraction = false;
    if ('.' === this.input.charAt(this.index)) {
      foundFraction = true;
      ++this.index;
      // Fraction part defaults to 0
      while (isDecDigit(this.input.charCodeAt(this.index))) {
        ++this.index;
      }
    }

    // Exponent part is optional.
    let foundExponent = false;
    if ([ 'e', 'E' ].includes(this.input.charAt(this.index))) {
      foundExponent = true;
      ++this.index;

      // Sign part is optional.
      if ([ '+', '-' ].includes(this.input.charAt(this.index))) {
        ++this.index;
      }

      // An exponent is required to contain at least one decimal digit.
      if (!isDecDigit(this.input.charCodeAt(this.index))) {
        this.raiseErr(errMessages.malformedNumber, this.input.slice(this.tokenStart, this.index));
      }

      while (isDecDigit(this.input.charCodeAt(this.index))) {
        ++this.index;
      }
    }

    return {
      value: parseFloat(this.input.slice(this.tokenStart, this.index)),
      hasFractionPart: foundFraction || foundExponent,
    };
  }

  readBinaryLiteral() {
    this.index += 2; // Skip 0b part

    while (isBinaryDigit(this.input.charCodeAt(this.index))) {
      ++this.index;
    }

    // Fraction part is optional
    let foundFraction = false;
    if ('.' === this.input.charAt(this.index)) {
      foundFraction = true;
      ++this.index;
      // Fraction part defaults to 0
      while (isBinaryDigit(this.input.charCodeAt(this.index))) {
        ++this.index;
      }
    }

    return {
      value: parseFloat(this.input.slice(this.tokenStart, this.index)),
      hasFractionPart: foundFraction,
    };
  }

  // Translate escape sequences to the actual characters.
  readEscapeSequence() {
    const sequenceStart = this.index;
    switch (this.input.charAt(this.index)) {
    // Lua allow the following escape sequences.
    case 'n': ++this.index; return '\n';
    case 'r': ++this.index; return '\r';
    case 't': ++this.index; return '\t';

      // Backslash at the end of the line. We treat all line endings as equivalent,
      // and as representing the [LF] character (code 10). Lua 5.1 through 5.3
      // have been verified to behave the same way.
    case '\r':
    case '\n':
      this.consumeEOL();
      return '\n';

    case 'z':
      ++this.index;
      this.skipWhiteSpace();
      return '';

    case 'x':
      // \xXX, where XX is a sequence of exactly two hexadecimal digits
      if (isHexDigit(this.input.charCodeAt(this.index + 1)) &&
          isHexDigit(this.input.charCodeAt(this.index + 2))) {
        this.index += 3;
        // TODO use frag again?
        // eslint-disable-next-line max-len
        return this.encodingMode.encodeByte(parseInt(this.input.slice(sequenceStart + 1, this.index), 16)); //, '\\' + this.input.slice(sequenceStart, this.index));
      }
      this.raiseErr(errMessages.hexadecimalDigitExpected, '\\' + this.input.slice(sequenceStart, this.index + 2));
      break;

    case '\\': case '"': case '\'':
      return this.input.charAt(this.index++);

    // P8SCII control codes to ignore, see: https://pico-8.fandom.com/wiki/P8SCII
    case '0':
    case '1':
    case '*':
    case '#':
    case '-':
    case '|':
    case '+':
    case '^':
    case 'a':
    case 'b':
    case 'v':
    case 'f':
      return this.input.charAt(this.index++);
    }

    this.raiseErr(errMessages.invalidEscape, '\\' + this.input.slice(sequenceStart, this.index + 1));
  }

  // Comments begin with -- after which it will be decided if they are
  // multiline comments or not.
  //
  // The multiline functionality works the exact same way as with string
  // literals so we reuse the functionality.

  scanComment(canBeLongComment: boolean) {
    this.tokenStart = this.index;
    this.index += 2; // --

    const character = this.input.charAt(this.index);
    const commentStart = this.index;
    const lineStartComment = this.lineStart;
    const lineComment = this.line;
    let content: string | false = '';
    let isLong = false;

    if (canBeLongComment && character === '[') {
      content = this.readLongString(true);
      // This wasn't a multiline comment after all.
      if (content === false) {
        content = character;
      } else {
        isLong = true;
      }
    }
    // Scan until next line as long as it's not a multiline comment.
    if (!isLong) {
      while (this.index < this.length) {
        if (isLineTerminator(this.input.charCodeAt(this.index))) {
          break;
        }
        ++this.index;
      }
      content = this.input.slice(commentStart, this.index);
    }

    let node = undefined;
    if (isLong) {
      node = AST.longComment(content, this.input.slice(this.tokenStart, this.index));
    } else {
      node = AST.comment(content, this.input.slice(this.tokenStart, this.index));
    }
    // `Marker`s depend on tokens available in the parser and as comments are
    // intercepted in the lexer all location data is set manually.
    node.loc = {
      start: {
        index: this.tokenStart,
        line: lineComment,
        column: this.tokenStart - lineStartComment,
        filename: this.filename,
      },
      end: {
        index: this.index,
        line: this.line,
        column: this.index - this.lineStart,
        filename: this.filename,
      },
    };
    return node;
  }

  // Read a multiline string by calculating the depth of `=` characters and
  // then appending until an equal depth is found.

  readLongString(isComment: boolean): string | false {
    let level = 0,
      content = '',
      terminator = false,
      character: string;
    const firstLine = this.line;

    ++this.index; // [

    // Calculate the depth of the comment.
    while ('=' === this.input.charAt(this.index + level)) {
      ++level;
    }
    // Exit, this is not a long string afterall.
    if ('[' !== this.input.charAt(this.index + level)) {
      return false;
    }

    this.index += level + 1;

    // If the first character is a newline, ignore it and begin on next line.
    if (isLineTerminator(this.input.charCodeAt(this.index))) {
      this.consumeEOL();
    }

    const stringStart = this.index;
    while (this.index < this.length) {
      // To keep track of line numbers run the `consumeEOL()` which increments
      // its counter.
      while (isLineTerminator(this.input.charCodeAt(this.index))) {
        this.consumeEOL();
      }

      character = this.input.charAt(this.index++);

      // Once the delimiter is found, iterate through the depth count and see
      // if it matches.
      if (']' === character) {
        terminator = true;
        for (let i = 0; i < level; ++i) {
          if ('=' !== this.input.charAt(this.index + i)) {
            terminator = false;
          }
        }

        if (']' !== this.input.charAt(this.index + level)) {
          terminator = false;
        }
      }

      // We reached the end of the multiline string. Get out now.
      if (terminator) {
        content += this.input.slice(stringStart, this.index - 1);
        this.index += level + 1;
        return content;
      }
    }

    const errMessage = isComment ? errMessages.unfinishedLongComment : errMessages.unfinishedLongString;
    this.raiseErr(errMessage, firstLine, '<eof>');
  }

  // ## Lex functions and helpers.

  // Read the next token.
  //
  // This is actually done by setting the current token to the lookahead and
  // reading in the new lookahead token.

  next() {
    this.previousToken = this.token;

    if (this.lookahead === undefined) {
      // First time calling next(), we'll call lex() twice to get lookahead in
      // the right state
      this.lookahead = this.lex();
    }

    if (this.newlineSignificant && this.token?.bounds.start.line !== this.lookahead.bounds.start.line) {
      this.token = this.makeToken(TokenType.Newline, '\\n');
      // lookahead remains the same until newlineSignificant is turned off
    } else {
      this.token = this.lookahead;
      this.lookahead = this.lex();
    }
  }

  consumeRestOfLine(fromIdx?: number) {
    this.previousToken = this.token;

    // Reset index to the number if provided, in case lookahead already ran forward
    if (fromIdx === undefined) {
      fromIdx = this.index;
    } else {
      this.index = fromIdx;
    }

    let charCode = this.input.charCodeAt(this.index);
    while (this.index < this.length && !isLineTerminator(charCode)) {
      this.index++;
      charCode = this.input.charCodeAt(this.index);
    }

    this.token = this.makeToken(TokenType.Raw, this.input.slice(fromIdx, this.index));

    this.lookahead = this.lex();
  }

  // Consume a token if its value matches. Once consumed or not, return the
  // success of the operation.

  consume(value: TokenValue) {
    if (value === this.token?.value) {
      this.next();
      return true;
    }
    return false;
  }

  // Expect the next token value to match. If not, throw an exception.

  expect(value: TokenValue) {
    if (value === this.token?.value) {
      this.next();
    } else {
      errors.raiseErrForToken(this.token!, errMessages.expected, value, this.token!.value);
    }
  }
}

// ### Validation functions

function isWhiteSpace(charCode: number): boolean {
  return 9 === charCode || 32 === charCode || 0xB === charCode || 0xC === charCode;
}

function isLineTerminator(charCode: number): boolean {
  return 10 === charCode || 13 === charCode;
}

function isDecDigit(charCode: number): boolean {
  return charCode >= 48 && charCode <= 57;
}

function isHexDigit(charCode: number): boolean {
  return (charCode >= 48 && charCode <= 57) || (charCode >= 97 && charCode <= 102) || (charCode >= 65 && charCode <= 70);
}

function isBinaryDigit(charCode: number): boolean {
  return charCode === 48 || charCode === 49;
}

// From [Lua 5.2](http://www.lua.org/manual/5.2/manual.html#8.1) onwards
// identifiers cannot use 'locale-dependent' letters (i.e. dependent on the C
// locale). On the other hand, LuaJIT allows arbitrary octets ≥ 128 in
// identifiers.
function isIdentifierStart(charCode: number): boolean {
  if (
    (charCode >= 65 && charCode <= 90) // A-Z
    || (charCode >= 97 && charCode <= 122) // a-z
    || 95 === charCode // _
    || charCode >= 128) { // other Unicode characters
    return true;
  }

  return false;
}

export function isIdentifierPart(charCode: number): boolean {
  if ((charCode >= 65 && charCode <= 90) // A-Z
    || (charCode >= 97 && charCode <= 122) // a-z
    || 95 === charCode // _
    || (charCode >= 48 && charCode <= 57) // 0-9
    || charCode >= 128) { // other Unicode characters
    return true;
  }

  return false;
}

// TODO should `true`, `false` and `nil` be keywords for PICO-8?
// [3.1 Lexical Conventions](http://www.lua.org/manual/5.2/manual.html#3.1)
// `true`, `false` and `nil` will not be considered keywords, but literals.
function isKeyword(id: string): boolean {
  switch (id.length) {
  case 2:
    return 'do' === id || 'if' === id || 'in' === id || 'or' === id;
  case 3:
    return 'and' === id || 'end' === id || 'for' === id || 'not' === id;
  case 4:
    return 'else' === id || 'then' === id || 'goto' === id;
  case 5:
    return 'break' === id || 'local' === id || 'until' === id || 'while' === id;
  case 6:
    return 'elseif' === id || 'repeat' === id || 'return' === id;
  case 8:
    return 'function' === id;
  }
  return false;
}

function isP8EndOfCodeSection(value: string): boolean {
  return value === '__gfx__'
    || value === '__label__'
    || value === '__gff__'
    || value === '__map__';
}
