import { ParseError } from './errors';
import { BinaryExpression, CallExpression, Comment_, Expression, GeneralTableField, Identifier, Indexer,
  IndexExpression, Variable, Literal, LogicalExpression, MemberExpression, StringCallExpression, StringLiteral,
  TableCallExpression, TableConstructorExpression, TableKey, TableKeyString, TableValue, UnaryExpression,
} from './expressions';
import { AssignmentStatement, BreakStatement, CallStatement, Chunk, DoStatement, ElseClause, ElseifClause,
  ForGenericStatement, ForNumericStatement, FunctionDeclaration, FunctionParameter, GeneralIfClause,
  GotoStatement, IfClause, IfStatement, LabelStatement, LocalStatement, RepeatStatement, ReturnStatement,
  Statement, WhileStatement } from './statements';
import { CodeSymbol } from './types';

// ### Abstract Syntax Tree
//
// The default AST structure is inspired by the Mozilla Parser API but can
// easily be customized by overriding these functions.
export default class AST {
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

  static ifStatement(clauses: GeneralIfClause[]): IfStatement {
    return {
      type: 'IfStatement',
      clauses: clauses,
    };
  }
  static ifClause(condition: Expression, body: Statement[]): IfClause {
    return {
      type: 'IfClause',
      condition: condition,
      body: body,
    };
  }
  static elseifClause(condition: Expression, body: Statement[]): ElseifClause {
    return {
      type: 'ElseifClause',
      condition: condition,
      body: body,
    };
  }
  static elseClause(body: Statement[]): ElseClause {
    return {
      type: 'ElseClause',
      body: body,
    };
  }

  static whileStatement(condition: Expression, body: Statement[]): WhileStatement {
    return {
      type: 'WhileStatement',
      condition: condition,
      body: body,
    };
  }

  static doStatement(body: Statement[]): DoStatement {
    return {
      type: 'DoStatement',
      body: body,
    };
  }

  static repeatStatement(condition: Expression, body: Statement[]): RepeatStatement {
    return {
      type: 'RepeatStatement',
      condition: condition,
      body: body,
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
    body: Statement[],
  ): FunctionDeclaration {
    return {
      type: 'FunctionDeclaration',
      identifier: identifier,
      isLocal: isLocal,
      parameters: parameters,
      body: body,
    };
  }

  static forNumericStatement(
    variable: Variable,
    start: Expression,
    end: Expression,
    step: Expression | null,
    body: Statement[],
  ): ForNumericStatement {
    return {
      type: 'ForNumericStatement',
      variable: variable,
      start: start,
      end: end,
      step: step,
      body: body,
    };
  }

  static forGenericStatement(variables: Variable[], iterators: Expression[], body: Statement[]): ForGenericStatement {
    return {
      type: 'ForGenericStatement',
      variables: variables,
      iterators: iterators,
      body: body,
    };
  }

  static chunk(body: Statement[], errors: ParseError[], symbols: CodeSymbol[]): Chunk {
    return {
      type: 'Chunk',
      body,
      errors,
      symbols,
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
  static memberExpression(base: Identifier | MemberExpression, indexer: Indexer, identifier: Identifier): MemberExpression {
    return {
      type: 'MemberExpression',
      indexer: indexer,
      identifier: identifier,
      base: base,
    };
  }

  static indexExpression(base: Identifier | MemberExpression, index: Expression): IndexExpression {
    return {
      type: 'IndexExpression',
      base: base,
      index: index,
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
}