import { FunctionDeclaration } from './statements';
import { Node_ } from './types';

export type Identifier = Node_ & {
  type: 'Identifier',
  name: string,
  isLocal?: boolean,
};

export type Variable = Identifier | MemberExpression;

export type StringLiteral = Node_ & {
  type: 'StringLiteral',
  value: string,
  raw: string,
};

export type NumericLiteral = Node_ & {
  type: 'NumericLiteral',
  value: number,
  raw: string,
};

export type BooleanLiteral = Node_ & {
  type: 'BooleanLiteral',
  value: boolean,
};

export type NilLiteral = Node_ & {
  type: 'NilLiteral'
};

// A VarargLiteral is '...'
export type VarargLiteral = Node_ & {
  type: 'VarargLiteral',
  value: any,
  raw: string,
};

export type Literal = StringLiteral | NumericLiteral | BooleanLiteral | NilLiteral | VarargLiteral;

export type TableKey = {
  type: 'TableKey',
  key: Expression,
  value: Expression,
};

export type TableKeyString = {
  type: 'TableKeyString',
  key: Expression,
  value: Expression,
};

export type TableValue = {
  type: 'TableValue',
  value: Expression,
};

export type GeneralTableField = TableKey | TableKeyString | TableValue;

export type TableConstructorExpression = Node_ & {
  type: 'TableConstructorExpression',
  fields: GeneralTableField[],
};

export type BinaryExpression = Node_ & {
  type: 'BinaryExpression',
  operator: string,
  left: Expression,
  right: Expression,
};

export type LogicalExpression = Node_ & {
  type: 'LogicalExpression',
  operator: 'and' | 'or',
  left: Expression,
  right: Expression,
};

export type UnaryExpression = Node_ & {
  type: 'UnaryExpression',
  operator: string,
  argument: Expression,
};

export type Indexer = '.' | ':';

export type MemberExpression = Node_ & {
  type: 'MemberExpression',
  indexer: Indexer,
  identifier: Identifier,
  base: Identifier | MemberExpression,
};

export type IndexExpression = Node_ & {
  type: 'IndexExpression',
  base: Identifier | MemberExpression,
  index: Expression,
};

export type CallExpression = Node_ & {
  type: 'CallExpression',
  base: Expression,
  arguments: Expression[],
};

export type TableCallExpression = Node_ & {
  type: 'TableCallExpression',
  base: Expression,
  arguments: TableConstructorExpression,
  argument: TableConstructorExpression,
};

export type StringCallExpression = Node_ & {
  type: 'StringCallExpression',
  base: Expression,
  argument: StringLiteral,
};

export type Expression = TableConstructorExpression | BinaryExpression | LogicalExpression | UnaryExpression
  | MemberExpression | IndexExpression | CallExpression | TableCallExpression | StringCallExpression | Literal
  | Identifier | FunctionDeclaration;

export type Comment_ = Node_ & {
  type: 'Comment',
  value: string,
  raw: string,
};