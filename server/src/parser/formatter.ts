import {
  AssignmentStatement, Block, BreakStatement, CallStatement, Chunk, DoStatement, ElseClause,
  ElseifClause, ForGenericStatement, ForNumericStatement, FunctionDeclaration, GeneralIfClause,
  GotoStatement, IfClause, IfStatement, isStatementWithBody, LabelStatement, LocalStatement,
  RepeatStatement, ReturnStatement, Statement, WhileStatement,
} from './statements';
import {
  BinaryExpression, BooleanLiteral, CallExpression, Comment_, DocComment, Expression, GeneralTableField,
  Identifier, IndexExpression, LogicalExpression, MemberExpression, NilLiteral, NumericLiteral,
  StringCallExpression, StringLiteral, TableCallExpression, TableConstructorExpression, TableKey,
  TableKeyString, TableValue, UnaryExpression, VarargLiteral, Whitespace,
} from './expressions';
import { uinteger } from 'vscode-languageserver-types';
import { ASTNode, boundsCompare, BoundsCompareResult } from './types';
import Operators from './operators';
import * as util from 'util';

export type FormatterOptions = {
  // Size of a tab in spaces.
  tabSize: uinteger,
  // Prefer spaces over tabs.
  insertSpaces: boolean,
  // Trim trailing whitespaces on a line.
  trimTrailingWhitespace?: boolean,
  // Insert a newline character at the end of the file if one does not exist.
  insertFinalNewline?: boolean,
  // Trim all newlines after the final newline at the end of the file.
  trimFinalNewlines?: boolean,
};

const defaultOptions: FormatterOptions = Object.freeze({
  tabSize: 2,
  insertSpaces: true,
});

type ChildContext = {
  parentOperator?: string,
  isRightSideOfAnExpression?: boolean,
};

/*
 * Formatter for visiting the AST and outputting a formatted representation of the code.
 *
 * Doesn't extend the ASTVisitor class because its visiting pattern is a bit different.
 */
export default class Formatter {
  currentIndent: number = 0;
  options: FormatterOptions;
  tab: string;

  constructor(options?: FormatterOptions) {
    if (options) {
      this.options = {
        ...defaultOptions,
        ...options, // this comes last so it overwrites
      };
    } else {
      this.options = defaultOptions;
    }

    this.tab = this.options.insertSpaces ? ' '.repeat(this.options.tabSize) : '\t';
  }

  formatChunk(chunk: Chunk): string {
    this.insertComments(chunk);
    this.insertWhitespace(chunk);

    // Most of the formatting work happens here
    let formatted = chunk.block.body.map(s => this.visitStatement(s)).join('\n');

    // Before returning, trim all trailing spaces from lines
    formatted = formatted.split('\n').map(line => line.trimRight()).join('\n');
    return formatted;
  }

  insertWhitespace(chunk: Chunk): void {
    for (let i = 1; i < chunk.block.body.length; i++) {
      const currStatement = chunk.block.body[i];
      const prevStatement = chunk.block.body[i-1];

      const currStmtStartLine = currStatement.loc!.start.line;
      const prevStmtEndLine = prevStatement.loc!.end.line;

      if (currStmtStartLine - prevStmtEndLine > 1) {
        // There's at least one empty line in between!

        const prevStmtEnd = prevStatement.loc!.end;
        const currStmtStart = currStatement.loc!.start;
        const newlines = currStmtStartLine - prevStmtEndLine - 1;

        // Insert a whitespace node
        chunk.block.body.splice(i, 0, {
          type: 'Whitespace',
          count: newlines,

          // Create a location for the new token
          loc: {
            start: {
              line: prevStmtEnd.line + 1,
              column: 0,
              index: prevStmtEnd.index + 1,
              filename: prevStmtEnd.filename,
            },
            end: {
              line: currStmtStart.line - 1,
              column: 0,
              index: currStmtStart.index - 1,
              filename: currStmtStart.filename,
            },
          },
        });

        // Increment i again to account for inserting another node at the
        // current position (otherwise we'd check the current node again, since
        // its index is now i+1)
        i++;
      }
    }
  }

  // Inserts all the comments in chunk.comments into the actual body of the AST,
  // so they go alongside regular statements and the visitor will encounter them
  // in order.
  insertComments(chunk: Chunk): void {
    chunk.comments!.forEach(comment => this.insertComment(comment, chunk.block.body, true));
    // console.log(JSON.stringify(chunk.block.body));
  }

  insertComment(comment: Comment_ | DocComment, body: ASTNode[], splice: boolean, canFail?: boolean): boolean {
    // right now just scans from the beginning, could be way more efficient
    for (let i = 0; i < body.length; i++) {
      const currNode: ASTNode = body[i];

      const compareResult = boundsCompare(comment.loc!, currNode.loc!);
      if (compareResult === BoundsCompareResult.CONTAINS) {
        this.insertCommentIntoNode(comment, currNode);
        return true;
      } else if (compareResult === BoundsCompareResult.BEFORE) {
        // This comment is before the current statement
        if (splice) {
          // insert it in the array
          body.splice(i, 0, comment);
        } else {
          // put it on the node itself
          if (currNode.comments === undefined) {
            currNode.comments = [ comment ];
          } else {
            currNode.comments.push(comment);
          }
        }
        return true;
      }
      // Else, the comment is after the current statement. Continue iterating.
    }

    if (canFail) {
      return false;
    }

    // If we got to this point, the comment is at the very end of the block.
    body.push(comment);
    return true;
  }

  insertCommentIntoNode(comment: Comment_ | DocComment, node: ASTNode) {
    if (isStatementWithBody(node)) {
      // This comment is contained in the body of the current statement. Recurse into it.
      this.insertComment(comment, node.block.body, true);
      return;
    }

    switch (node.type) {
    case 'IfStatement':
      // Check each clause of the if statement
      this.insertComment(comment, (node as IfStatement).clauses, false);
      return;

    case 'ReturnStatement':
      // check each returned expression
      this.insertComment(comment, (node as ReturnStatement).arguments, false);
      return;

    case 'AssignmentStatement':
    case 'LocalStatement':
      // check each initializer and assigned expression
      const init = this.insertComment(comment, (node as LocalStatement).init, false, true);
      if (!init) {
        this.insertComment(comment, (node as LocalStatement).variables, false);
      }
      return;

    case 'TableConstructorExpression':
      this.insertComment(comment, (node as TableConstructorExpression).fields, false);
      return;
    }

    // If we got this far, just put it on the node itself
    if (node.comments === undefined) {
      node.comments = [ comment ];
    } else {
      node.comments.push(comment);
    }
  }

  newline() {
    return '\n' + this.tabsForDepth();
  }

  tabsForDepth(): string {
    let ret = '';
    for (let i = 0; i < this.currentIndent; i++) {
      ret += this.tab;
    }
    return ret;
  }

  increaseDepth() {
    this.currentIndent++;
  }

  decreaseDepth() {
    this.currentIndent--;
  }

  commentsBeforeNode(node: ASTNode, dontIndent?: boolean): string {
    let ret = '';
    if (node.comments !== undefined) {
      if (!dontIndent) {
      // Caller responsible for returning to previous depth after calling this
        this.increaseDepth();
      }

      for (const comment of node.comments) {
        if (!dontIndent) {
          ret += this.newline();
        }
        ret += this.visitComment(comment);
        ret += this.newline();
      }
    }
    return ret;
  }

  visitStatement(node: Statement): string {
    const prevIndent = this.currentIndent;
    let ret = this.commentsBeforeNode(node);

    switch (node.type) {
    case 'AssignmentStatement': ret += this.visitAssignmentStatement(node); break;
    case 'BreakStatement': ret += this.visitBreakStatement(node); break;
    case 'CallStatement': ret += this.visitCallStatement(node); break;
    case 'DoStatement': ret += this.visitDoStatement(node); break;
    case 'ForGenericStatement': ret += this.visitForGenericStatement(node); break;
    case 'ForNumericStatement': ret += this.visitForNumericStatement(node); break;
    case 'FunctionDeclaration': ret += this.visitFunctionDeclaration(node, true); break;
    case 'GotoStatement': ret += this.visitGotoStatement(node); break;
    case 'IfStatement': ret += this.visitIfStatement(node); break;
    case 'LabelStatement': ret += this.visitLabelStatement(node); break;
    case 'LocalStatement': ret += this.visitLocalStatement(node); break;
    case 'RepeatStatement': ret += this.visitRepeatStatement(node); break;
    case 'ReturnStatement': ret += this.visitReturnStatement(node); break;
    case 'WhileStatement': ret += this.visitWhileStatement(node); break;
    case 'Comment': ret += this.visitComment(node); break;
    case 'Whitespace': ret += this.visitWhitespace(node); break;
    default: throw new Error('Unexpected statement type: ' + (node as any).type);
    }

    this.currentIndent = prevIndent;
    return ret;
  }

  visitBlock(block: Block, begin?: string, skipEnd?: boolean): string {
    const stmts = block.body;

    let ret = '';
    begin ??= 'do';

    ret += begin;
    this.increaseDepth();

    for (const stmt of stmts) {
      ret += this.newline();
      ret += this.visitStatement(stmt);
    }

    this.decreaseDepth();

    if (!skipEnd) {
      ret += this.newline();
      ret += 'end';
    }
    return ret;
  }

  visitGeneralIfClause(node: GeneralIfClause): string {
    switch (node.type) {
    case 'IfClause': return this.visitIfClause(node);
    case 'ElseClause': return this.visitElseClause(node);
    case 'ElseifClause': return this.visitElseifClause(node);
    default: throw new Error('Unexpected if clause type: ' + (node as any).type + ', ' + util.inspect(node, { depth: 99 }));
    }
  }

  visitExpression(node: Expression, childContext: ChildContext = {}): string {
    const prevIndent = this.currentIndent;
    let ret = this.commentsBeforeNode(node);

    switch (node.type) {
    // TODO: Which other expression should receive childContext as well?
    case 'FunctionDeclaration': ret += this.visitFunctionDeclaration(node, false, childContext); break;
    case 'BinaryExpression': ret += this.visitBinaryExpression(node, childContext); break;
    case 'BooleanLiteral': ret += this.visitBooleanLiteral(node); break;
    case 'CallExpression': ret += this.visitCallExpression(node); break;
    case 'IndexExpression': ret += this.visitIndexExpression(node); break;
    case 'Identifier': ret += this.visitIdentifier(node); break;
    case 'LogicalExpression': ret += this.visitLogicalExpression(node, childContext); break;
    case 'MemberExpression': ret += this.visitMemberExpression(node); break;
    case 'NilLiteral': ret += this.visitNilLiteral(node); break;
    case 'NumericLiteral': ret += this.visitNumericLiteral(node); break;
    case 'StringCallExpression': ret += this.visitStringCallExpression(node); break;
    case 'StringLiteral': ret += this.visitStringLiteral(node); break;
    case 'TableCallExpression': ret += this.visitTableCallExpression(node); break;
    case 'TableConstructorExpression': ret += this.visitTableConstructorExpression(node, childContext); break;
    case 'UnaryExpression': ret += this.visitUnaryExpression(node); break;
    case 'VarargLiteral': ret += this.visitVarargLiteral(node); break;
    default: throw new Error('Unexpected expression type: ' + (node as any).type);
    }

    this.currentIndent = prevIndent;
    return ret;
  }

  visitGeneralTableField(node: GeneralTableField | Comment_): string {
    let ret = this.commentsBeforeNode(node, true);

    switch (node.type) {
    case 'TableKey': ret += this.visitTableKey(node); break;
    case 'TableKeyString': ret += this.visitTableKeyString(node); break;
    case 'TableValue': ret += this.visitTableValue(node); break;
    case 'Comment': ret += this.visitComment(node); break;
    default: throw new Error('Unexpected table field type: ' + (node as any).type);
    }

    return ret;
  }

  // ****************************** Statements *****************************

  visitAssignmentStatement(node: AssignmentStatement): string {
    const variables = node.variables.map(v => this.visitExpression(v));
    const init = node.init.map(v => this.visitExpression(v));

    let ret = variables.join(', ');
    ret += ' ';
    ret += node.operator;
    ret += ' ';
    ret += init.join(', ');
    return ret;
  }

  visitLocalStatement(node: LocalStatement): string {
    const variables = node.variables.map(v => this.visitExpression(v));
    const init = node.init.map(v => this.visitExpression(v));

    let ret = 'local ';
    ret += variables.join(', ');

    // `local a, b, c` is a valid statement
    if (init.length > 0) {
      ret += ' ';
      ret += node.operator ?? '=';
      ret += ' ';
      ret += init.join(', ');
    }

    return ret;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  visitBreakStatement(node: BreakStatement): string {
    return 'break';
  }

  visitCallStatement(node: CallStatement): string {
    if (!node.expression) {
      throw new Error('Can\'t visit CallStatement with null expression!');
    }

    return this.visitExpression(node.expression);
  }

  visitDoStatement(node: DoStatement): string {
    return this.visitBlock(node.block);
  }

  visitForGenericStatement(node: ForGenericStatement): string {
    const variables = node.variables.map(v => this.visitExpression(v));
    const iterators = node.iterators.map(v => this.visitExpression(v));

    let ret = 'for ';
    ret += variables.join(', ');
    ret += ' in ';
    ret += iterators.join(', ');
    ret += ' ';
    ret += this.visitBlock(node.block);
    return ret;
  }

  visitForNumericStatement(node: ForNumericStatement): string {
    let ret = 'for ';
    ret += this.visitIdentifier(node.variable);
    ret += ' = ';
    ret += this.visitExpression(node.start);
    ret += ', ';
    ret += this.visitExpression(node.end);

    if (node.step) {
      ret += ', ';
      ret += this.visitExpression(node.step);
    }

    ret += ' ';
    ret += this.visitBlock(node.block);
    return ret;
  }

  visitGotoStatement(node: GotoStatement): string {
    return 'goto ' + this.visitIdentifier(node.label);
  }

  visitIfStatement(node: IfStatement): string {
    if (node.oneLine && node.clauses.length === 1 && node.clauses[0].block.body.length === 1) {
      const clause = node.clauses[0] as IfClause;
      return `if (${this.visitExpression(clause.condition)}) ${this.visitStatement(clause.block.body[0])}`;
    }

    let ret = '';
    for (const clause of node.clauses) {
      ret += this.visitGeneralIfClause(clause);
    }
    ret += 'end';
    return ret;
  }

  visitLabelStatement(node: LabelStatement): string {
    let ret = '::';
    ret += this.visitIdentifier(node.label);
    ret += '::';
    return ret;
  }

  visitRepeatStatement(node: RepeatStatement): string {
    let ret = this.visitBlock(node.block, 'repeat', true);
    ret += 'until ';
    ret += this.visitExpression(node.condition);
    return ret;
  }

  visitReturnStatement(node: ReturnStatement): string {
    let ret = '';
    if (!node.arguments || node.arguments.length === 0) {
      // Empty return statement
      ret += 'return';
      return ret;
    }

    // return statement with args
    const args = node.arguments.map(a => this.visitExpression(a)).join(', ');
    ret += 'return ';
    ret += args;
    return ret;
  }

  visitWhileStatement(node: WhileStatement): string {
    let ret = 'while ';
    ret += this.visitExpression(node.condition);
    ret += this.visitBlock(node.block, ' do');
    return ret;
  }

  // ****************************** If Clauses *****************************

  visitIfClause(node: IfClause): string {
    let ret = 'if ';
    ret += this.visitExpression(node.condition);
    ret += this.visitBlock(node.block, ' then', true);
    ret += this.newline();
    return ret;
  }

  visitElseifClause(node: ElseifClause): string {
    let ret = 'elseif ';
    ret += this.visitExpression(node.condition);
    ret += this.visitBlock(node.block, ' then', true);
    ret += this.newline();
    return ret;
  }

  visitElseClause(node: ElseClause): string {
    return this.visitBlock(node.block, 'else', true) + this.newline();
  }

  // ****************************** Literals *****************************

  visitBooleanLiteral(node: BooleanLiteral): string {
    return node.value ? 'true' : 'false';
  }

  visitNilLiteral(_node: NilLiteral): string {
    return 'nil';
  }

  visitNumericLiteral(node: NumericLiteral): string {
    return node.raw;
  }

  visitStringLiteral(node: StringLiteral): string {
    return node.raw;
  }

  visitVarargLiteral(_node: VarargLiteral): string {
    return '...';
  }

  // ****************************** Expressions *****************************

  visitBinaryExpression(node: BinaryExpression, childContext: ChildContext = {}): string {
    return this.wrapWithParenthesesIfNeeded(
      {
        isRightSideOfAnExpression: childContext.isRightSideOfAnExpression,
        parentOperator: childContext.parentOperator,
        currentOperator: node.operator,
      },
      () => {
        let ret = '';
        ret += this.visitExpression(node.left, { parentOperator: node.operator });
        ret += ` ${node.operator} `;
        ret += this.visitExpression(node.right, { parentOperator: node.operator, isRightSideOfAnExpression: true });
        return ret;
      });
  }

  visitCallExpression(node: CallExpression): string {
    // first, check if the original function call is on more than one line
    const startingLine = node.base.loc?.start.line;
    const multiline = node.arguments.some(a => a.loc!.end.line !== startingLine);

    let ret = this.visitExpression(node.base, { parentOperator: Operators.fakeMaxPrecedenceOperator });
    ret += '(';

    if (multiline) {
      // Increase indent
      this.increaseDepth();
      ret += this.newline();

      // Each argument on a newline
      let first = true;
      for (const arg of node.arguments) {
        if (first) {
          first = false;
        } else {
          ret += ',' + this.newline();
        }

        ret += this.visitExpression(arg);
      }

      this.decreaseDepth();
      // Trailing ')' goes on its own line
      ret += this.newline();
    } else {
      ret += node.arguments.map(a => this.visitExpression(a)).join(', ');
    }

    ret += ')';
    return ret;
  }

  visitFunctionDeclaration(node: FunctionDeclaration, isStatement: boolean, childContext: ChildContext = {}): string {
    return this.wrapWithParenthesesIfNeeded(
      {
        parentOperator: childContext.parentOperator,
      },
      () => {
        let ret = '';
        if (node.isLocal) {
          ret += 'local ';
        }
        ret += 'function';
        if (node.identifier) {
          ret += ' ' + this.visitExpression(node.identifier);
        }
        ret += '(' + node.parameters.map(a => this.visitExpression(a)).join(', ') + ')';

        this.increaseDepth();

        for (const stmt of node.block.body) {
          ret += this.newline();
          ret += this.visitStatement(stmt);
        }

        this.decreaseDepth();
        ret += this.newline();
        ret += 'end';

        return ret;
      });
  }

  visitIdentifier(node: Identifier): string {
    return node.name;
  }

  visitIndexExpression(node: IndexExpression): string {
    let ret = '';
    ret += this.visitExpression(node.base, { parentOperator: Operators.fakeMaxPrecedenceOperator });
    ret += '[';
    ret += this.visitExpression(node.index);
    ret += ']';
    return ret;
  }

  visitLogicalExpression(node: LogicalExpression, childContext: ChildContext = {}): string {
    return this.wrapWithParenthesesIfNeeded(
      {
        isRightSideOfAnExpression: childContext.isRightSideOfAnExpression,
        parentOperator: childContext.parentOperator,
        currentOperator: node.operator,
      },
      () => {
        let ret = '';
        ret += this.visitExpression(node.left, { parentOperator: node.operator });
        ret += ` ${node.operator} `;
        ret += this.visitExpression(node.right, { parentOperator: node.operator, isRightSideOfAnExpression: true });
        return ret;
      });
  }

  visitMemberExpression(node: MemberExpression): string {
    let ret = '';
    ret += this.visitExpression(node.base, { parentOperator: Operators.fakeMaxPrecedenceOperator });
    ret += node.indexer;
    ret += this.visitIdentifier(node.identifier);
    return ret;
  }

  visitStringCallExpression(node: StringCallExpression): string {
    return this.visitExpression(node.base) + ' ' + this.visitStringLiteral(node.argument);
  }

  visitTableCallExpression(node: TableCallExpression): string {
    return this.visitExpression(node.base) + ' ' + this.visitTableConstructorExpression(node.arguments);
  }

  visitTableConstructorExpression(node: TableConstructorExpression, childContext: ChildContext = {}): string {
    // first, check if the original function call is on more than one line
    const startingLine = node.loc?.start.line;
    const multiline = node.fields.some(f => f.loc!.end.line !== startingLine);
    const newlineFunc = multiline ? this.newline.bind(this) : () => '';

    return this.wrapWithParenthesesIfNeeded(
      {
        parentOperator: childContext.parentOperator,
      },
      () => {
        let ret = '';

        ret += '{';
        if (multiline) {
          this.increaseDepth();
        }

        let first = true;
        for (const f of node.fields) {
          if (!first) {
            ret += ',' + (multiline ? '' : ' ');
          }
          first = false;
          ret += newlineFunc();
          ret += this.visitGeneralTableField(f);
        }

        if (multiline) {
          this.decreaseDepth();
        }
        ret += newlineFunc();
        ret += '}';
        return ret;
      });
  }

  visitUnaryExpression(node: UnaryExpression): string {
    let opStr = node.operator;
    if (opStr === 'not') {
      // Append space onto end of `not`, otherwise you get `not a` -> `nota`
      opStr = 'not ';
    }
    return `${opStr}${this.visitExpression(node.argument)}`;
  }

  visitTableKey(node: TableKey): string {
    return '[' + this.visitExpression(node.key) + '] = ' + this.visitExpression(node.value);
  }

  visitTableKeyString(node: TableKeyString): string {
    return this.visitIdentifier(node.key) + ' = ' + this.visitExpression(node.value);
  }

  visitTableValue(node: TableValue): string {
    return this.visitExpression(node.value);
  }

  visitComment(node: Comment_ | DocComment): string {
    return node.raw;
  }

  visitWhitespace(_node: Whitespace): string {
    // the newline will be added later when all statements are joined
    return '';
  }

  private wrapWithParenthesesIfNeeded(
    params: {
      parentOperator?: string;
      currentOperator?: string,
      isRightSideOfAnExpression?: boolean,
    },
    expressionToWrap: () => string,
  ): string {
    const expression = expressionToWrap();

    const parentPrecedence = params.parentOperator
      ? Operators.binaryPrecedenceOf(params.parentOperator)
      : Operators.minPrecedenceValue;
    const currentPrecedence = params.currentOperator
      ? Operators.binaryPrecedenceOf(params.currentOperator)
      : Operators.minPrecedenceValue;
    if (currentPrecedence < parentPrecedence) {
      return `(${expression})`;
    }

    if (
      params.parentOperator &&
      params.parentOperator === params.currentOperator &&
      params.isRightSideOfAnExpression &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      Operators.doesNeedParenthesesIfOnTheRightSide(params.parentOperator)
    ) {
      return `(${expression})`;
    }

    return expression;
  }
}
