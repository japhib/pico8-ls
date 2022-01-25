import { DefinitionsUsagesLookup } from './definitions-usages';
import { ParseError } from './errors';
import { Comment_, Expression, Identifier, VarargLiteral, Variable, MemberExpression, getMemberExpressionName } from './expressions';
import { CodeSymbol } from './symbols';
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
  operator?: string,
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
  variable: Identifier,
  start: Expression,
  end: Expression,
  step: Expression | null,
  body: Statement[],
};

export type ForGenericStatement = ASTNode & {
  type: 'ForGenericStatement',
  variables: Identifier[],
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

export function getFunctionDeclarationName(funcDeclaration: FunctionDeclaration): string {
  if (!funcDeclaration.identifier)
    return '<anonymous function>';

  return funcDeclaration.identifier.type === 'Identifier' ?
    funcDeclaration.identifier.name : getMemberExpressionName(funcDeclaration.identifier);
}

export function getBareFunctionDeclarationName(funcDeclaration: FunctionDeclaration): string {
  if (!funcDeclaration.identifier)
    return '<anonymous function>';

  if (funcDeclaration.identifier.type === 'Identifier') {
    return funcDeclaration.identifier.name;
  } else { // funcDeclaration.identifier.type === 'MemberExpression'
    return funcDeclaration.identifier.identifier.name;
  }
}

export type Statement = LabelStatement | BreakStatement | GotoStatement | ReturnStatement | IfStatement
  | WhileStatement | DoStatement | RepeatStatement | LocalStatement | AssignmentStatement | CallStatement
  | FunctionDeclaration | ForNumericStatement | ForGenericStatement;

export type Chunk = {
  type: 'Chunk',
  body: Statement[],
  errors: ParseError[],
  symbols: CodeSymbol[],
  definitionsUsages: DefinitionsUsagesLookup,
  comments?: Comment_[],
  globals?: Identifier[],
};
