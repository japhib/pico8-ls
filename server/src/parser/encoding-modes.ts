import { errMessages, raiseErr } from './errors';
import { CodeLocation } from './types';

export type EncodingMode = {
  discardStrings: boolean;
  fixup: (loc: CodeLocation, s: string) => string;
  encodeByte: (value: null | number) => string;
  encodeUTF8: (codepoint: number, highMask?: number) => string | null;
};

function encodeUTF8(codepoint: number, highMask?: number) : string | null {
  highMask = highMask || 0;

  if (codepoint < 0x80) {
    return String.fromCharCode(codepoint);
  } else if (codepoint < 0x800) {
    return String.fromCharCode(
      highMask | 0xc0 |  (codepoint >>  6)        ,
      highMask | 0x80 | ( codepoint        & 0x3f),
    );
  } else if (codepoint < 0x10000) {
    return String.fromCharCode(
      highMask | 0xe0 |  (codepoint >> 12)        ,
      highMask | 0x80 | ((codepoint >>  6) & 0x3f),
      highMask | 0x80 | ( codepoint        & 0x3f),
    );
  } else if (codepoint < 0x110000) {
    return String.fromCharCode(
      highMask | 0xf0 |  (codepoint >> 18)        ,
      highMask | 0x80 | ((codepoint >> 12) & 0x3f),
      highMask | 0x80 | ((codepoint >>  6) & 0x3f),
      highMask | 0x80 | ( codepoint        & 0x3f),
    );
  } else {
    // TODO: Lua 5.4 allows up to six-byte sequences, as in UTF-8:1993
    return null;
  }
}

function toHex(num: number, digits: number): string {
  let result = num.toString(16);
  while (result.length < digits)
    result = '0' + result;
  return result;
}

function checkChars(loc: CodeLocation, s: string, rx: RegExp) {
  const m = rx.exec(s);
  if (!m)
    return s;
  raiseErr({ start: loc, end: loc }, errMessages.invalidCodeUnit, toHex(m[0].charCodeAt(0), 4).toUpperCase());
}

// TODO fix this up so it converts PICO-8 special characters into the right "ascii" characters or whatever

// `pseudo-latin1` encoding mode: assume the input was decoded with the latin1 encoding
// WARNING: latin1 does **NOT** mean cp1252 here like in the
// bone-headed WHATWG standard; it means true ISO/IEC 8859-1 identity-mapped
// to Basic Latin and Latin-1 Supplement blocks
class PseudoLatin1 implements EncodingMode {
  discardStrings = false;

  fixup(loc: CodeLocation, s: string): string {
    return checkChars(loc, s, /[^\x00-\xff]/);
  }

  encodeByte(val: null | number) {
    if (val === null)
      return '';
    return String.fromCharCode(val);
  }

  encodeUTF8(codepoint: number) {
    return encodeUTF8(codepoint);
  }
}

// `x-user-defined` encoding mode: assume the input was decoded with the
// WHATWG `x-user-defined` encoding
class XUserDefined implements EncodingMode {
  discardStrings = false;

  fixup(loc: CodeLocation, s: string): string {
    return checkChars(loc, s, /[^\x00-\x7f\uf780-\uf7ff]/);
  }

  encodeByte(val: null | number) {
    if (val === null)
      return '';
    if (val >= 0x80)
      return String.fromCharCode(val | 0xf700);
    return String.fromCharCode(val);
  }

  encodeUTF8(codepoint: number) {
    return encodeUTF8(codepoint, 0xf700);
  }
}

// `none` encoding mode: disregard intrepretation of string literals, leave
// identifiers as-is
class NoEncodingMode implements EncodingMode {
  discardStrings = true;

  fixup(s: any): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return s;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  encodeByte(value: null | number): string {
    return '';
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  encodeUTF8(codepoint: number): string {
    return '';
  }
}

export enum EncodingModeType {
  PseudoLatin1 = 'pseudo-latin1',
  XUserDefined = 'x-user-defined',
  None = 'none',
}

export const encodingModes: { [key in EncodingModeType]: EncodingMode } = {
  'pseudo-latin1': new PseudoLatin1(),
  'x-user-defined': new XUserDefined(),
  'none': new NoEncodingMode(),
};
