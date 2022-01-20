import { Range_ } from './types';

export enum TokenType {
  EOF = 'EOF',
  StringLiteral = 'StringLiteral',
  Keyword = 'Keyword',
  Identifier = 'Identifier',
  NumericLiteral = 'NumericLiteral',
  Punctuator = 'Punctuator',
  BooleanLiteral = 'BooleanLiteral',
  NilLiteral = 'NilLiteral',
  VarargLiteral = 'VarargLiteral',
}

export type TokenValue = string | boolean | number | null;

export type Token = {
  type: TokenType,
  value: TokenValue,
  index: number,
  line: number,
  lineStart: number,
  range: Range_,
  lastLine?: number,
  lastLineStart?: number,
};
