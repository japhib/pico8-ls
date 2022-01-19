import { Comment_, Expression, Identifier, VarargLiteral, Variable, MemberExpression } from './expressions';
import { Node_ } from './types';

export type LabelStatement = Node_ & {
  type: 'LabelStatement',
  label: Identifier
};

export type BreakStatement = Node_ & {
  type: 'BreakStatement',
};

export type GotoStatement = Node_ & {
  type: 'GotoStatement',
  label: Identifier,
};

export type ReturnStatement = Node_ & {
  type: 'ReturnStatement',
  arguments: Expression[],
};

export type IfStatement = Node_ & {
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

export type WhileStatement = Node_ & {
  type: 'WhileStatement',
  condition: Expression,
  body: Statement[],
};

export type DoStatement = Node_ & {
  type: 'DoStatement',
  body: Statement[],
};

export type RepeatStatement = Node_ & {
  type: 'RepeatStatement',
  condition: Expression,
  body: Statement[],
};

export type LocalStatement = Node_ & {
  type: 'LocalStatement',
  variables: Variable[],
  init: Expression[],
};

export type AssignmentStatement = Node_ & {
  type: 'AssignmentStatement',
  variables: Variable[],
  operator: string,
  init: Expression[],
};

export type CallStatement = Node_ & {
  type: 'CallStatement',
  expression: Expression | null,
};

export type ForNumericStatement = Node_ & {
  type: 'ForNumericStatement',
  variable: Variable,
  start: Expression,
  end: Expression,
  step: Expression | null,
  body: Statement[],
};

export type ForGenericStatement = Node_ & {
  type: 'ForGenericStatement',
  variables: Variable[],
  iterators: Expression[],
  body: Statement[],
};

export type FunctionParameter = Identifier | VarargLiteral;

export type FunctionDeclaration = Node_ & {
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
  comments?: Comment_[],
  globals?: Identifier[],
};
