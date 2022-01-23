import { FunctionDeclaration } from './statements';
import { ASTNode } from './types';

export type Identifier = ASTNode & {
  type: 'Identifier',
  name: string,
  isLocal?: boolean,
};

export type Variable = Identifier | MemberExpression;

export type StringLiteral = ASTNode & {
  type: 'StringLiteral',
  value: string,
  raw: string,
};

export type NumericLiteral = ASTNode & {
  type: 'NumericLiteral',
  value: number,
  raw: string,
};

export type BooleanLiteral = ASTNode & {
  type: 'BooleanLiteral',
  value: boolean,
};

export type NilLiteral = ASTNode & {
  type: 'NilLiteral'
};

// A VarargLiteral is '...'
export type VarargLiteral = ASTNode & {
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
  key: Identifier,
  value: Expression,
};

export type TableValue = {
  type: 'TableValue',
  value: Expression,
};

export type GeneralTableField = TableKey | TableKeyString | TableValue;

export type TableConstructorExpression = ASTNode & {
  type: 'TableConstructorExpression',
  fields: GeneralTableField[],
};

export type BinaryExpression = ASTNode & {
  type: 'BinaryExpression',
  operator: string,
  left: Expression,
  right: Expression,
};

export type LogicalExpression = ASTNode & {
  type: 'LogicalExpression',
  operator: 'and' | 'or',
  left: Expression,
  right: Expression,
};

export type UnaryExpression = ASTNode & {
  type: 'UnaryExpression',
  operator: string,
  argument: Expression,
};

export type Indexer = '.' | ':';

export type MemberExpression = ASTNode & {
  type: 'MemberExpression',
  indexer: Indexer,
  identifier: Identifier,
  base: Identifier | MemberExpression,
};

export function getMemberExpressionName(memberExpression: MemberExpression): string {
  const baseName = memberExpression.base.type === 'Identifier' ? memberExpression.base.name
    : getMemberExpressionName(memberExpression.base);

  return baseName + memberExpression.indexer + memberExpression.identifier.name;
}

export type IndexExpression = ASTNode & {
  type: 'IndexExpression',
  base: Identifier | MemberExpression,
  index: Expression,
};

export type CallExpression = ASTNode & {
  type: 'CallExpression',
  base: Expression,
  arguments: Expression[],
};

export type TableCallExpression = ASTNode & {
  type: 'TableCallExpression',
  base: Expression,
  arguments: TableConstructorExpression,
};

export type StringCallExpression = ASTNode & {
  type: 'StringCallExpression',
  base: Expression,
  argument: StringLiteral,
};

export type Expression = TableConstructorExpression | BinaryExpression | LogicalExpression | UnaryExpression
  | MemberExpression | IndexExpression | CallExpression | TableCallExpression | StringCallExpression | Literal
  | Identifier | FunctionDeclaration;

export type Comment_ = ASTNode & {
  type: 'Comment',
  value: string,
  raw: string,
};
