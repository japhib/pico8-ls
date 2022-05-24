import { Bounds } from './types';

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
  Newline = 'Newline',
  Raw = 'Raw',
}

export type TokenValue = string | boolean | number | null;

export type Token = {
  type: TokenType,
  value: TokenValue,
  bounds: Bounds,
};
