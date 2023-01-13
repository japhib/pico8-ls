import { ParseError } from './errors';
import { BinaryExpression, CallExpression, Comment_, Expression, GeneralTableField, Identifier, Indexer,
  IndexExpression, Variable, Literal, LogicalExpression, MemberExpression, StringCallExpression, StringLiteral,
  TableCallExpression, TableConstructorExpression, TableKey, TableKeyString, TableValue, UnaryExpression, DocComment,
} from './expressions';
import { AssignmentStatement, Block, BreakStatement, CallStatement, Chunk, DoStatement, ElseClause, ElseifClause,
  ForGenericStatement, ForNumericStatement, FunctionDeclaration, FunctionParameter, GeneralIfClause,
  GotoStatement, IfClause, IfStatement, LabelStatement, LocalStatement, RepeatStatement, ReturnStatement,
  Statement, WhileStatement } from './statements';
import { Bounds, boundsToString } from './types';
import structuredClone = require('@ungap/structured-clone');

// ### Abstract Syntax Tree
//
// The default AST structure is inspired by the Mozilla Parser API but can
// easily be customized by overriding these functions.
export default class AST {
  static block(body: Statement[]): Block {
    return {
      type: 'Block',
      body,
    };
  }

  static labelStatement(label: Identifier): LabelStatement {
    return {
      type: 'LabelStatement',
      label: label,
    };
  }

  static breakStatement(): BreakStatement {
    return {
      type: 'BreakStatement',
    };
  }

  static gotoStatement(label: Identifier): GotoStatement {
    return {
      type: 'GotoStatement',
      label: label,
    };
  }

  static returnStatement(args: Expression[]): ReturnStatement {
    return {
      type: 'ReturnStatement',
      'arguments': args,
    };
  }

  static ifStatement(clauses: GeneralIfClause[], oneLine: boolean): IfStatement {
    return {
      type: 'IfStatement',
      clauses: clauses,
      oneLine,
    };
  }

  static ifClause(condition: Expression, block: Block): IfClause {
    return {
      type: 'IfClause',
      condition: condition,
      block: block,
    };
  }

  static elseifClause(condition: Expression, block: Block): ElseifClause {
    return {
      type: 'ElseifClause',
      condition: condition,
      block: block,
    };
  }

  static elseClause(block: Block): ElseClause {
    return {
      type: 'ElseClause',
      block: block,
    };
  }

  static whileStatement(condition: Expression, block: Block): WhileStatement {
    return {
      type: 'WhileStatement',
      condition: condition,
      block: block,
    };
  }

  static doStatement(block: Block): DoStatement {
    return {
      type: 'DoStatement',
      block: block,
    };
  }

  static repeatStatement(condition: Expression, block: Block): RepeatStatement {
    return {
      type: 'RepeatStatement',
      condition: condition,
      block: block,
    };
  }

  static localStatement(variables: Variable[], operator: string | undefined, init: Expression[]): LocalStatement {
    return {
      type: 'LocalStatement',
      variables,
      operator,
      init,
    };
  }

  static assignmentStatement(variables: Variable[], operator: string, init: Expression[]): AssignmentStatement {
    return {
      type: 'AssignmentStatement',
      variables,
      operator,
      init,
    };
  }

  static callStatement(expression: Expression | null): CallStatement {
    return {
      type: 'CallStatement',
      expression: expression,
    };
  }

  static functionStatement(
    identifier: Identifier | MemberExpression | null,
    parameters: FunctionParameter[],
    isLocal: boolean,
    block: Block,
    docComment?: string,
  ): FunctionDeclaration {
    return {
      type: 'FunctionDeclaration',
      identifier: identifier,
      isLocal: isLocal,
      parameters: parameters,
      block: block,
      docComment: docComment,
    };
  }

  static forNumericStatement(
    variable: Identifier,
    start: Expression,
    end: Expression,
    step: Expression | null,
    block: Block,
  ): ForNumericStatement {
    return {
      type: 'ForNumericStatement',
      variable: variable,
      start: start,
      end: end,
      step: step,
      block: block,
    };
  }

  static forGenericStatement(variables: Identifier[], iterators: Expression[], block: Block): ForGenericStatement {
    return {
      type: 'ForGenericStatement',
      variables: variables,
      iterators: iterators,
      block: block,
    };
  }

  static chunk(block: Block, errors: ParseError[]): Chunk {
    return {
      type: 'Chunk',
      block,
      errors,

      // This stuff is added later
      symbols: [],
    };
  }

  static identifier(name: string): Identifier {
    return {
      type: 'Identifier',
      name: name,
    };
  }

  static literal(type: string, value: string | number | boolean | null, raw: string): Literal {
    switch (type) {
    case 'StringLiteral':
      return {
        type: 'StringLiteral',
        value: value as string,
        raw: raw,
      };
    case 'NumericLiteral':
      return {
        type: 'NumericLiteral',
        value: value as number,
        raw: raw,
      };
    case 'BooleanLiteral':
      return {
        type: 'BooleanLiteral',
        value: value as boolean,
      };
    case 'NilLiteral':
      return {
        type: 'NilLiteral',
      };
    default:
      return {
        type: 'VarargLiteral',
        value: value,
        raw: raw,
      };
    }
  }

  static tableKey(key: Expression, value: Expression): TableKey {
    return {
      type: 'TableKey',
      key: key,
      value: value,
    };
  }

  static tableKeyString(key: Identifier, value: Expression): TableKeyString {
    return {
      type: 'TableKeyString',
      key,
      value,
    };
  }

  static tableValue(value: Expression): TableValue {
    return {
      type: 'TableValue',
      value: value,
    };
  }

  static tableConstructorExpression(fields: GeneralTableField[]): TableConstructorExpression {
    return {
      type: 'TableConstructorExpression',
      fields: fields,
    };
  }

  static binaryExpression(operator: string, left: Expression, right: Expression): BinaryExpression | LogicalExpression {
    if (operator === 'and' || operator === 'or') {
      return {
        type: 'LogicalExpression',
        operator: operator,
        left: left,
        right: right,
      };
    }

    return {
      type: 'BinaryExpression',
      operator: operator,
      left: left,
      right: right,
    };
  }

  static unaryExpression(operator: string, argument: Expression): UnaryExpression {
    return {
      type: 'UnaryExpression',
      operator: operator,
      argument: argument,
    };
  }

  static memberExpression(base: Expression, indexer: Indexer, identifier: Identifier): MemberExpression {
    return {
      type: 'MemberExpression',
      indexer,
      identifier,
      base,
    };
  }

  static indexExpression(base: Expression, index: Expression): IndexExpression {
    return {
      type: 'IndexExpression',
      base,
      index,
    };
  }

  static callExpression(base: Expression, args: Expression[]): CallExpression {
    return {
      type: 'CallExpression',
      base: base,
      arguments: args,
    };
  }

  static tableCallExpression(base: Expression, args: TableConstructorExpression): TableCallExpression {
    return {
      type: 'TableCallExpression',
      base: base,
      'arguments': args,
    };
  }

  static stringCallExpression(base: Expression, argument: StringLiteral): StringCallExpression {
    return {
      type: 'StringCallExpression',
      base: base,
      argument: argument,
    };
  }

  static comment(value: string, raw: string): Comment_ {
    return {
      type: 'Comment',
      value: value,
      raw: raw,
    };
  }

  static longComment(value: string, raw: string): Comment_ {
    return {
      type: 'LongComment',
      value: value,
      raw: raw,
    };
  }

  static docComment(value: string, raw: string): DocComment {
    return {
      type: 'DocComment',
      value: value,
      raw: raw,
    };
  }
}

// Converts all "Bounds" objects in the AST into more concise, human-readable strings
export function toReadableObj(body: Statement[]) {
  // Operate on a clone rather than mutating the original
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  body = structuredClone(body);

  for (const stmt of body) {
    toReadableObjRecursive(stmt);
  }
  return body;
}

function toReadableObjRecursive(obj: any) {
  Object.keys(obj).forEach(key => {
    if (key === 'loc') {
      obj[key] = boundsToString(obj[key] as Bounds);
    } else if (typeof obj[key] === 'object') {
      toReadableObjRecursive(obj[key]);
    }
  });
}
