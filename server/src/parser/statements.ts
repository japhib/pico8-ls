import { ParseError } from './errors';
import { Comment_, Expression, Identifier, VarargLiteral, Variable, MemberExpression } from './expressions';
import { ASTNode } from './types';

export type LabelStatement = ASTNode & {
  type: 'LabelStatement',
  label: Identifier
};

export type BreakStatement = ASTNode & {
  type: 'BreakStatement',
};

export type GotoStatement = ASTNode & {
  type: 'GotoStatement',
  label: Identifier,
};

export type ReturnStatement = ASTNode & {
  type: 'ReturnStatement',
  arguments: Expression[],
};

export type IfStatement = ASTNode & {
  type: 'IfStatement',
  clauses: GeneralIfClause[],
};

export type IfClause = {
  type: 'IfClause',
  condition: Expression,
  body: Statement[],
};

export type ElseifClause = {
  type: 'ElseifClause',
  condition: Expression,
  body: Statement[],
};

export type ElseClause = {
  type: 'ElseClause',
  body: Statement[],
};

export type GeneralIfClause = IfClause | ElseifClause | ElseClause;

export type WhileStatement = ASTNode & {
  type: 'WhileStatement',
  condition: Expression,
  body: Statement[],
};

export type DoStatement = ASTNode & {
  type: 'DoStatement',
  body: Statement[],
};

export type RepeatStatement = ASTNode & {
  type: 'RepeatStatement',
  condition: Expression,
  body: Statement[],
};

export type LocalStatement = ASTNode & {
  type: 'LocalStatement',
  variables: Variable[],
  init: Expression[],
};

export type AssignmentStatement = ASTNode & {
  type: 'AssignmentStatement',
  variables: Variable[],
  operator: string,
  init: Expression[],
};

export type CallStatement = ASTNode & {
  type: 'CallStatement',
  expression: Expression | null,
};

export type ForNumericStatement = ASTNode & {
  type: 'ForNumericStatement',
  variable: Variable,
  start: Expression,
  end: Expression,
  step: Expression | null,
  body: Statement[],
};

export type ForGenericStatement = ASTNode & {
  type: 'ForGenericStatement',
  variables: Variable[],
  iterators: Expression[],
  body: Statement[],
};

export type FunctionParameter = Identifier | VarargLiteral;

export type FunctionDeclaration = ASTNode & {
  type: 'FunctionDeclaration',
  identifier: Identifier | MemberExpression | null,
  isLocal: boolean,
  parameters: FunctionParameter[],
  body: Statement[],
};

export type Statement = LabelStatement | BreakStatement | GotoStatement | ReturnStatement | IfStatement
  | WhileStatement | DoStatement | RepeatStatement | LocalStatement | AssignmentStatement | CallStatement
  | FunctionDeclaration | ForNumericStatement | ForGenericStatement;

export type Chunk = {
  type: 'Chunk',
  body: Statement[],
  errors: ParseError[],
  comments?: Comment_[],
  globals?: Identifier[],
};
