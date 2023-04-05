import { FunctionDeclaration } from './statements';
import { ASTNode } from './types';

export type Identifier = ASTNode & {
  type: 'Identifier',
  name: string,
  isLocal?: boolean,
};

export type Variable = Identifier | MemberExpression | IndexExpression;

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

// { [keyExpr] = value }
export type TableKey = ASTNode & {
  type: 'TableKey',
  key: Expression,
  value: Expression,
};

// { key = value }
export type TableKeyString = ASTNode & {
  type: 'TableKeyString',
  key: Identifier,
  value: Expression,
};

// { value }
export type TableValue = ASTNode & {
  type: 'TableValue',
  value: Expression,
};

export type GeneralTableField = TableKey | TableKeyString | TableValue;

const generalTableFieldTypes = Object.freeze(['TableKey', 'TableKeyString', 'TableValue']);
export function isGeneralTableField(node: ASTNode): node is GeneralTableField {
  return generalTableFieldTypes.includes(node.type);
}

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

// base.identifier
// or base:identifier
export type MemberExpression = ASTNode & {
  type: 'MemberExpression',
  base: Expression,
  indexer: Indexer,
  identifier: Identifier,
};

export function getMemberExpressionName(memberExpression: MemberExpression): string | undefined {
  let baseName: string;
  switch (memberExpression.base.type) {
  case 'Identifier':
    baseName = memberExpression.base.name;
    break;

  case 'MemberExpression':
    const maybeBaseName = getMemberExpressionName(memberExpression.base);
    if (maybeBaseName === undefined) {
      return undefined;
    } else {
      baseName = maybeBaseName;
    }
    break;

  default:
    // It's a more complicated expression like `getValue().blah`
    return undefined;
  }

  return baseName + '.' + memberExpression.identifier.name;
}

// Get the parent of a member expression.
// e.g. `a.b.c` => `a.b`
export function getMemberExpressionParentName(memberExpression: MemberExpression): string | undefined {
  const name = getMemberExpressionName(memberExpression);
  if (name) {
    const nameParts = name.split(/[.:]/);
    return nameParts.length > 1 ? nameParts.slice(0, nameParts.length - 1).join('.') : undefined;
  }

  return name;
}

// Get the base identifier of a member expression.
// e.g. `a.b.c` => `a`
export function getMemberExpresionBaseIdentifier(memberExpression: MemberExpression): Identifier | undefined {
  let base = memberExpression.base;
  // This is a while loop since it could be deeply nested.
  //    a.b.c = true
  // In that case we want baseName to be 'a', and the symbol name to be 'a.b.c'
  while (true) {
    switch (base.type) {
    case 'Identifier':
      // Found it!
      return base;

    case 'MemberExpression':
      // Keep recursing
      base = base.base;
      break;

    default:
      // It's something other than an identifier or member expression
      return undefined;
    }
  }
}

// base[index]
export type IndexExpression = ASTNode & {
  type: 'IndexExpression',
  base: Expression,
  index: Expression,
};

export type CallExpression = ASTNode & {
  type: 'CallExpression',
  base: Expression,
  arguments: Expression[],
};

// func { argument }
export type TableCallExpression = ASTNode & {
  type: 'TableCallExpression',
  base: Expression,
  arguments: TableConstructorExpression,
};

// func "argument"
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

export type Whitespace = ASTNode & {
  type: 'Whitespace',
  // The number of newlines to insert
  count: number,
};

export function isComment(node: any): node is Comment_ {
  return node.type === 'Comment';
}
