import {
  AssignmentStatement, Block, BreakStatement, CallStatement, Chunk, DoStatement, ElseClause,
  ElseifClause, ForGenericStatement, ForNumericStatement, FunctionDeclaration, GeneralIfClause,
  GotoStatement, IfClause, IfStatement, IncludeStatement, isStatementWithBody, isStatementWithCondition, LabelStatement, LocalStatement,
  RepeatStatement, ReturnStatement, Statement, WhileStatement,
} from './statements';
import {
  BinaryExpression, BooleanLiteral, CallExpression, Comment_, Expression, GeneralTableField,
  Identifier, IndexExpression, isGeneralTableField, LogicalExpression, MemberExpression, NilLiteral, NumericLiteral,
  StringCallExpression, StringLiteral, TableCallExpression, TableConstructorExpression, TableKey,
  TableKeyString, TableValue, UnaryExpression, VarargLiteral, Whitespace,
} from './expressions';
import { uinteger } from 'vscode-languageserver-types';
import { ASTNode, boundsCompare, BoundsCompareResult } from './types';
import Operators from './operators';
import * as util from 'util';
import { isP8BeginningOfCodeSection, isP8EndOfCodeSection } from './lexer';

export type FormatterOptions = {
  // Size of a tab in spaces.
  tabSize: uinteger,
  // Prefer spaces over tabs.
  insertSpaces: boolean,
  // Force each statement to be on a separate line.
  forceSeparateLines?: boolean,

  // Options provided by VSCode onDocumentFormatting call, but ignored by formatter for now

  // // Trim trailing whitespaces on a line.
  // trimTrailingWhitespace?: boolean,
  // // Insert a newline character at the end of the file if one does not exist.
  // insertFinalNewline?: boolean,
  // // Trim all newlines after the final newline at the end of the file.
  // trimFinalNewlines?: boolean,
};

// Range/Position declarations taken from vscode-languageserver-node declarations.
// We don't need to use full Bounds declaration here.
export interface LSRange {
  start: LSPosition;
  end: LSPosition;
}
export interface LSPosition {
  line: uinteger;
  character: uinteger;
}
export type FormatResult = {
  formattedText: string,
  formattedRange: LSRange
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

  formatChunk(chunk: Chunk, originalText: string, isPlainLuaFile: boolean): FormatResult | undefined {
    if (chunk.errors.length > 0) {
      console.error('can\'t format - errors are present!');
      return undefined;
    }

    let formatRange: LSRange;
    if (isPlainLuaFile) {
      // it's a lua file, format the whole thing
      formatRange = {
        start: { line: 0, character: 0 },
        end: { line: Number.MAX_VALUE, character: 0 },
      };
    } else {
      // it's a p8 file w/ header & data sections
      const _formatRange = this.formatBoundsFromOriginalText(originalText);
      if (!_formatRange) {
        // lua section not found -- format nothing!
        return undefined;
      }
      formatRange = _formatRange;
    }

    this.insertComments(chunk);
    this.insertWhitespaceIntoBlock(chunk.block);

    // Most of the formatting work happens here
    let formatted = this.visitBlock(chunk.block, '', true, true);

    // Before returning, trim all trailing spaces from lines
    formatted = formatted.split('\n').map(line => line.trimRight()).join('\n');

    if (!isPlainLuaFile) {
      // Add whitespace buffer at the end
      formatted = formatted + '\n';

      // add an extra newline if we found an ending tag (__gfx__ for example)
      if (formatRange.end.line !== Number.MAX_VALUE) {
        formatted += '\n';
      }
    }

    return {
      formattedText: formatted,
      formattedRange: formatRange,
    };
  }

  formatBoundsFromOriginalText(originalText: string): LSRange | undefined {
    const lines = originalText.split('\n').map(s => s.trim());

    let startLine;
    let endLine = Number.MAX_VALUE;
    let inLua = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!inLua && isP8BeginningOfCodeSection(line)) {
        startLine = i + 1; // +1: start the line *after* the __lua__ declaration
        inLua = true;
      } else if (inLua && isP8EndOfCodeSection(line)) {
        endLine = i;
        break;
      }
    }

    if (!startLine) {
      // Lua code section not found!
      return undefined;
    }

    return {
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: 0 },
    };
  }

  insertWhitespaceIntoBlock(block: Block): void {
    // handle undefined/null arg
    if (!block) {
      return;
    }

    this.insertWhitespaceIntoArray(block.body);
  }

  insertWhitespaceIntoArray(body: (Statement | Expression | GeneralTableField)[]): void {
    let prevStatement = body[0];

    for (let i = 1; i < body.length; i++) {
      // recurse into members
      this.maybeRecurseToInsertWhitespace(prevStatement);

      const currStatement = body[i];
      // skip included nodes, without resetting `prevStatement`
      if (currStatement.included) {
        continue;
      }

      const currStmtStartLine = currStatement.loc!.start.line;
      const prevStmtEndLine = prevStatement.loc!.end.line;

      if (currStmtStartLine - prevStmtEndLine > 1) {
        // There's at least one empty line in between!

        const prevStmtEnd = prevStatement.loc!.end;
        const currStmtStart = currStatement.loc!.start;
        const newlines = currStmtStartLine - prevStmtEndLine - 1;

        // Insert a whitespace node
        const line = currStmtStart.line - 1;
        body.splice(i, 0, {
          type: 'Whitespace',
          count: newlines,

          // Create a location for the new token
          loc: {
            start: {
              line,
              column: 0,
              index: prevStmtEnd.index + 1,
              filename: prevStmtEnd.filename,
            },
            end: {
              line,
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

      prevStatement = currStatement;
    }

    if (body.length > 0) {
      // Recurse into last statement, if exists
      this.maybeRecurseToInsertWhitespace(body[body.length - 1]);
    }
  }

  maybeRecurseToInsertWhitespace(node: ASTNode): void {
    // skip falsey & included nodes
    if (!node || node.included) {
      return;
    }

    if (isStatementWithBody(node)) {
      this.insertWhitespaceIntoBlock(node.block);
      return;
    }

    if (isGeneralTableField(node)) {
      // Recurse into table members
      this.maybeRecurseToInsertWhitespace(node.value);
      return;
    }

    switch (node.type) {
    case 'IfStatement':
      // Check each clause of the if statement
      (node as IfStatement).clauses
        .map(clause => clause.block)
        .forEach(block => this.insertWhitespaceIntoBlock(block));
      return;

    case 'ReturnStatement':
      // check each returned expression
      this.insertWhitespaceIntoArray((node as ReturnStatement).arguments);
      return;

    case 'AssignmentStatement':
    case 'LocalStatement':
      // check each initializer and assigned expression
      this.insertWhitespaceIntoArray((node as LocalStatement).init);
      this.insertWhitespaceIntoArray((node as LocalStatement).variables);
      return;

    case 'TableConstructorExpression':
      this.insertWhitespaceIntoArray((node as TableConstructorExpression).fields);
      return;

    case 'CallExpression':
      // check each argument
      this.insertWhitespaceIntoArray((node as CallExpression).arguments);
      return;

    case 'BinaryExpression':
    case 'LogicalExpression':
      // check both left and right
      const expr = node as BinaryExpression;
      this.maybeRecurseToInsertWhitespace(expr.left);
      this.maybeRecurseToInsertWhitespace(expr.right);
      return;
    }
  }

  // Inserts all the comments in chunk.comments into the actual body of the AST,
  // so they go alongside regular statements and the visitor will encounter them
  // in order.
  insertComments(chunk: Chunk): void {
    chunk.comments!.forEach(comment => this.insertComment(comment, chunk.block.body, true));
    // console.log(JSON.stringify(chunk.block.body));
  }

  insertComment(comment: Comment_, body: ASTNode[], splice: boolean, canFail?: boolean): boolean {
    // right now just scans from the beginning, could be way more efficient
    for (let i = 0; i < body.length; i++) {
      const currNode: ASTNode = body[i];
      if (currNode.included) {
        // Ignore includes
        continue;
      }

      const compareResult = boundsCompare(comment.loc!, currNode.loc!);

      // console.log(`insertComment, (splice:${splice}) comment:`, boundsToString(comment.loc!), 'currNode', currNode.type, boundsToString(currNode.loc!), 'result', compareResult)

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
          this.putCommentOnNode(currNode, comment);
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

  insertCommentIntoNode(comment: Comment_, node: ASTNode): void {

    // console.log('insertCommentIntoNode, comment:', boundsToString(comment.loc!), 'node', node.type, boundsToString(node.loc!));

    // For if/while statements, the comment may be contained in the condition of the statement
    if (isStatementWithCondition(node)
        && this.maybeInsertCommentOnNode(comment, (node ).condition)) {
      return;
    }

    if (isStatementWithBody(node)) {
      // This comment is contained in the body of the current statement. Recurse into it.
      this.insertComment(comment, node.block.body, true);
      return;
    }

    if (isGeneralTableField(node)) {
      // Recurse into table members
      this.insertCommentIntoNode(comment, node.value);
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
      this.insertComment(comment, (node as TableConstructorExpression).fields, true);
      return;

    case 'CallStatement':
      const callExpression = (node as CallStatement).expression as CallExpression;
      if (callExpression && callExpression.arguments) {
        this.insertComment(comment, callExpression.arguments, true);
        return;
      }
      break;

    case 'CallExpression':
      const callExpression2 = node as CallExpression;
      if (callExpression2 && callExpression2.arguments) {
        this.insertComment(comment, callExpression2.arguments, true);
        return;
      }
      return;

    case 'BinaryExpression':
    case 'LogicalExpression':
      const expr = node as BinaryExpression;

      // try both left and right sub-expressions
      if (this.maybeInsertCommentOnNode(comment, expr.left) ||
            this.maybeInsertCommentOnNode(comment, expr.right)) {
        return;
      }
      // fall through to put comment on node itself
      break;
    }

    // If we got this far, just put it on the node itself
    this.putCommentOnNode(node, comment);
  }

  maybeInsertCommentOnNode(comment: Comment_, currNode: ASTNode): boolean {
    const compareResult = boundsCompare(comment.loc!, currNode.loc!);

    // console.log('maybeInsertCommentOnNode, comment:', boundsToString(comment.loc!), 'currNode', currNode.type, boundsToString(currNode.loc!), 'result', compareResult)

    if (compareResult === BoundsCompareResult.CONTAINS) {
      this.insertCommentIntoNode(comment, currNode);
      return true;
    }

    if (compareResult === BoundsCompareResult.BEFORE) {
      // put it on the node itself
      this.putCommentOnNode(currNode, comment);
      return true;
    }

    return false;
  }

  putCommentOnNode(node: ASTNode, comment: Comment_): void {
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

  increaseDepth(amount: number = 1) {
    this.currentIndent += amount;
  }

  decreaseDepth(amount: number = 1) {
    this.currentIndent -= amount;
  }

  commentsBeforeNode(node: ASTNode, dontIndent?: boolean, noTrailingNewline?: boolean): string {
    let ret = '';
    if (node.comments !== undefined) {
      if (!dontIndent) {
        // Caller responsible for returning to previous depth after calling this
        this.increaseDepth();
      }

      for (let i = 0; i < node.comments.length; i++) {
        const comment = node.comments[i];

        if (!dontIndent) {
          ret += this.newline();
        }
        ret += this.visitComment(comment);

        if (!noTrailingNewline || i !== node.comments.length - 1) {
          ret += this.newline();
        }
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
    case 'FunctionDeclaration': ret += this.visitFunctionDeclaration(node); break;
    case 'GotoStatement': ret += this.visitGotoStatement(node); break;
    case 'IfStatement': ret += this.visitIfStatement(node); break;
    case 'IncludeStatement': ret += this.visitIncludeStatement(node); break;
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

  visitBlock(
    block: Block,
    begin?: string, skipEnd?: boolean, topLevel?: boolean): string {

    let ret = '';
    begin ??= 'do';
    ret += begin;

    if (!topLevel) {
      this.increaseDepth();
    }

    const body = block.body;
    const forceSeparateLines = !!this.options.forceSeparateLines;
    for (let i = 0; i < body.length; i++) {
      const stmt = body[i];

      // Ignore included statements
      if (stmt.included) {
        continue;
      }

      if (i !== 0 || !topLevel) {
        if (forceSeparateLines) {
          ret += this.newline();
        } else {
          // Compare with location of previous statement to see if we append a
          // newline or just a space between them
          const prev = i > 0 ? body[i - 1] : undefined;
          const isOnSameLine = prev && !prev.included && prev.loc!.end.line === stmt.loc!.start.line;
          ret += isOnSameLine ? ' ' : this.newline();
        }
      }

      // Actually format the statement
      ret += this.visitStatement(stmt).trimRight();
    }

    if (!topLevel) {
      this.decreaseDepth();
    }

    if (!skipEnd) {
      ret += this.newline();
      ret += 'end';
    }
    return ret;
  }

  visitGeneralIfClause(node: GeneralIfClause | Comment_ | Whitespace): string {
    switch (node.type) {
    case 'IfClause': return this.visitIfClause(node);
    case 'ElseClause': return this.visitElseClause(node);
    case 'ElseifClause': return this.visitElseifClause(node);
    case 'Comment': return this.visitComment(node) + this.newline();
    case 'Whitespace': return this.visitWhitespace(node) + this.newline();
    default: throw new Error('Unexpected if clause type: ' + (node as any).type + ', ' + util.inspect(node, { depth: 99 }));
    }
  }

  visitExpression(node: Expression, childContext: ChildContext = {}): string {
    const prevIndent = this.currentIndent;
    let ret = this.commentsBeforeNode(node);

    switch (node.type) {
    // TODO: Which other expression should receive childContext as well?
    case 'FunctionDeclaration': ret += this.visitFunctionDeclaration(node); break;
    case 'BinaryExpression': ret += this.visitBinaryOrLogicalExpression(node, childContext); break;
    case 'BooleanLiteral': ret += this.visitBooleanLiteral(node); break;
    case 'CallExpression': ret += this.visitCallExpression(node); break;
    case 'IndexExpression': ret += this.visitIndexExpression(node); break;
    case 'Identifier': ret += this.visitIdentifier(node); break;
    case 'LogicalExpression': ret += this.visitBinaryOrLogicalExpression(node, childContext); break;
    case 'MemberExpression': ret += this.visitMemberExpression(node); break;
    case 'NilLiteral': ret += this.visitNilLiteral(node); break;
    case 'NumericLiteral': ret += this.visitNumericLiteral(node); break;
    case 'StringCallExpression': ret += this.visitStringCallExpression(node); break;
    case 'StringLiteral': ret += this.visitStringLiteral(node); break;
    case 'TableCallExpression': ret += this.visitTableCallExpression(node); break;
    case 'TableConstructorExpression': ret += this.visitTableConstructorExpression(node); break;
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
    case 'Whitespace': ret += this.visitWhitespace(node); break;
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
    if (node.oneLine) {
      // there may be a comment after the single IfClause
      const clausesWithoutComments = node.clauses.filter(cl => (cl as any).type !== 'Comment');
      const comments = node.clauses.filter(cl => (cl as any).type === 'Comment');

      if (clausesWithoutComments.length === 1) {
        const clause = clausesWithoutComments[0] as IfClause;
        let ret = `if (${this.visitExpression(clause.condition)})`;
        // There can be multiple statements inside even a single-line if
        for (const stmt of clause.block.body) {
          ret += ' ' + this.visitStatement(stmt);
        }
        // Tack on any comments at the end
        for (const comment of comments) {
          ret += this.newline() + this.visitComment(comment as any as Comment_);
        }

        return ret;
      }
      // Else, fall through to regular if-statement handling
    }

    if (this.isSingleLineIfStatement(node)) {
      if (node.clauses.length === 1) {
        const clause = node.clauses[0] as IfClause;

        if (node.oneLine) {
          return `if (${this.visitExpression(clause.condition)}) ${this.visitStatement(clause.block.body[0])}`;
        } else {
          return `if ${this.visitExpression(clause.condition)} then ${this.visitStatement(clause.block.body[0])} end`;
        }
      } else if (node.clauses.length === 2 && node.clauses[1].type === 'ElseClause') {
        const ifClause = node.clauses[0] as IfClause;
        const elseClause = node.clauses[1] ;

        return `if ${this.visitExpression(ifClause.condition)} then ${this.visitStatement(ifClause.block.body[0])} else ${this.visitStatement(elseClause.block.body[0])} end`;
      }
    }

    let ret = '';
    for (const clause of node.clauses) {
      ret += this.visitGeneralIfClause(clause);
    }
    ret += 'end';
    return ret;
  }

  isSingleLineIfStatement(stmt: IfStatement) {
    if (stmt.oneLine) {
      return true;
    }

    const startingLine = stmt.loc!.start.line;

    return stmt.clauses.every(cl =>
      cl.loc!.start.line === startingLine &&
      cl.loc!.end.line === startingLine &&
      !cl.comments &&
      cl.block.body.length === 1 &&
      cl.block.body.every(stmt =>
        stmt.loc!.start.line === startingLine &&
        stmt.loc!.end.line === startingLine &&
        !stmt.comments));
  }

  visitIncludeStatement(node: IncludeStatement): string {
    return `#include ${node.filename}`;
  }

  visitLabelStatement(node: LabelStatement): string {
    let ret = '::';
    ret += this.visitIdentifier(node.label);
    ret += '::';
    return ret;
  }

  visitRepeatStatement(node: RepeatStatement): string {
    let ret = this.visitBlock(node.block, 'repeat', true);

    // Manually visit comments on condition node and then unset them
    if (node.condition.comments !== undefined) {
      ret += this.commentsBeforeNode(node.condition, false, true);
      node.condition.comments = undefined;

      this.decreaseDepth();
    }
    ret += this.newline();

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
    const args = node.arguments
      // Whitespace is a bit problematic, causes extra commas. Leaving unsupported for now
      .filter(node => node.type !== 'Whitespace')
      .map(a => this.visitExpression(a))
      .join(', ');
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

  visitBinaryOrLogicalExpression(node: BinaryExpression | LogicalExpression, childContext: ChildContext = {}): string {
    return this.wrapWithParenthesesIfNeeded(
      {
        isRightSideOfAnExpression: childContext.isRightSideOfAnExpression,
        parentOperator: childContext.parentOperator,
        currentOperator: node.operator,
        extraIndent: true,
        parens: node.parens,
      },
      () => {
        let ret = '';
        ret += this.visitExpression(node.left, { parentOperator: node.operator });

        const multiline = node.left.loc!.end.line !== node.right.loc!.start.line;
        if (multiline) {
          this.increaseDepth(2);
          ret += this.newline();

          // Check for a comment on the right node so it goes before the newline
          if (node.right.comments) {
            ret += this.commentsBeforeNode(node.right, true);
            node.right.comments = undefined;
          }

          this.decreaseDepth(2);
        } else {
          ret += ' ';
        }

        ret += `${node.operator} `;
        ret += this.visitExpression(node.right, { parentOperator: node.operator, isRightSideOfAnExpression: true });
        return ret;
      });
  }

  visitCallExpression(node: CallExpression): string {
    // Check if the original function call is on more than one line
    const multiline = node.arguments.length > 1 && node.arguments.some(a => a.loc!.end.line !== node.base.loc?.start.line);

    let base = this.visitExpression(node.base, { parentOperator: Operators.fakeMaxPrecedenceOperator });

    const questionShorthand: boolean = node.base.type === 'Identifier' && node.base.name === '?';

    if (node.base.type === 'FunctionDeclaration') {
      // wrap in parentheses, e.g.
      //     (function(a) return a+1 end)(5)
      base = `(${base})`;
    }

    const args = this.visitCommaDelimited(
      node.arguments,
      this.visitExpression.bind(this),
      { multiline, noParens: questionShorthand },
    );

    return base + args;
  }

  visitFunctionDeclaration(node: FunctionDeclaration): string {
    // Support multiline or single-line functions (force multiline if options.forceSeparateLines enabled)
    const multiline = this.options.forceSeparateLines || node.loc!.start.line !== node.loc!.end.line;

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
      ret += multiline ? this.newline() : ' ';
      ret += this.visitStatement(stmt);
    }

    this.decreaseDepth();
    ret += multiline ? this.newline() : ' ';
    ret += 'end';

    return ret;
  }

  visitIdentifier(node: Identifier): string {
    return node.name;
  }

  visitIndexExpression(node: IndexExpression): string {
    let ret = this.visitExpression(node.base, { parentOperator: Operators.fakeMaxPrecedenceOperator });

    // If TableConstructorExpression is base, must be wrapped in parens.
    // For example:
    //
    //   local result = ({
    //     [123] = "xyz"
    //   })[123]
    //
    // ^ This results in a syntax error if the parentheses are removed.
    if (node.base.type === 'TableConstructorExpression') {
      ret = '(' + ret + ')';
    }

    ret += '[';
    ret += this.visitExpression(node.index);
    ret += ']';
    return ret;
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

  visitTableConstructorExpression(node: TableConstructorExpression): string {
    if (!node.fields?.length) {
      // Special case empty table
      return '{}';
    }

    // Check if the original function call is on more than one line
    const multiline = node.fields.some(f => f.loc!.end.line !== node.loc?.start.line);

    return this.visitCommaDelimited(
      node.fields,
      this.visitGeneralTableField.bind(this),
      { multiline, paddingForSingleLine: true, curlyBraces: true },
    );
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

  visitComment(node: Comment_): string {
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
      extraIndent?: boolean,
      parens?: boolean,
    },
    expressionToWrap: () => string,
  ): string {
    const {
      parentOperator,
      currentOperator,
      isRightSideOfAnExpression,
      extraIndent,
      parens,
    } = params;

    let shouldWrap: boolean = !!parens;

    const parentPrecedence = parentOperator
      ? Operators.binaryPrecedenceOf(parentOperator)
      : Operators.minPrecedenceValue;
    const currentPrecedence = currentOperator
      ? Operators.binaryPrecedenceOf(currentOperator)
      : Operators.minPrecedenceValue;
    if (currentPrecedence < parentPrecedence) {
      shouldWrap = true;
    }

    if (
      parentOperator &&
      parentOperator === currentOperator &&
      isRightSideOfAnExpression &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      Operators.doesNeedParenthesesIfOnTheRightSide(parentOperator)
    ) {
      shouldWrap = true;
    }

    if (shouldWrap && extraIndent) {
      this.increaseDepth();
    }
    const expression = expressionToWrap();
    if (shouldWrap && extraIndent) {
      this.decreaseDepth();
    }
    return shouldWrap ? `(${expression})` : expression;
  }

  // Visit a potentially multiline, comma delimited list of function call args or table
  // constructor elements, some of which may be comments.
  // Has special comma-handling logic.
  private visitCommaDelimited<T extends ASTNode>(
    fields: (T | Comment_ | Whitespace)[],
    fieldHandler: (arg: T) => string,
    opts: { multiline?: boolean, paddingForSingleLine?: boolean, curlyBraces?: boolean, noParens?: boolean },
  ): string {

    const multiline = !!opts.multiline;
    const newlineFunc = multiline ? this.newline.bind(this) : () => '';

    // Beginning
    let ret = '';
    if (!opts.noParens) {
      ret = opts.curlyBraces ? '{' : '(';
    }

    if (multiline) {
      this.increaseDepth();
    } else if (opts.paddingForSingleLine) {
      ret += ' ';
    }

    let preCommaSlice = null;
    let commaConfirmed = true;
    let prevFieldEndingLine = undefined;
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];

      // Compare starting line of current field to ending line of previous field
      // to see whether to add zero, one, or two newlines.
      if (!prevFieldEndingLine) {
        ret += newlineFunc();
      } else {
        const fieldCurrLine = field.loc!.start.line;

        if (fieldCurrLine === prevFieldEndingLine + 1) {
          // one newline
          ret += newlineFunc();
        } else if (fieldCurrLine > prevFieldEndingLine + 1) {
          // two or more newlines, condense to two
          ret += newlineFunc() + newlineFunc();
        } else {
          // else, it's on the same line as previous one, so zero newlines.
          if (multiline) {
            // Add a space to separate the fields so they don't run together.
            ret += ' ';
          }
        }
      }
      prevFieldEndingLine = field.loc!.end.line;

      const isComment = field.type === 'Comment';
      const isWhitespace = field.type === 'Whitespace';
      const isRealField = !isComment && !isWhitespace;

      if (isWhitespace) {
        ret += this.visitWhitespace(field as Whitespace);
      } else if (isComment) {
        ret += this.visitComment(field as Comment_);
      } else {
        ret += fieldHandler(field as T);
        // Flag that helps us to remove a trailing comma if there's whitespace/commas afterwards
        commaConfirmed = true;
      }

      const isLast = i === fields.length - 1;
      if (!isLast && isRealField) {
        const toAdd = ',' + (multiline ? '' : ' ');
        // Save location of this last comma, so we can slice it out later if needed
        preCommaSlice = [ ret.length, ret.length + toAdd.length ];
        commaConfirmed = false;
        ret += toAdd;
      }
    }

    if (!commaConfirmed) {
      // We added a comma earlier but there hasn't been a non-whitespace,
      // non-comment field between the comma and the end of the table
      // constructor expression. So we remove out the comma.
      ret = ret.slice(0, preCommaSlice![0]) + ret.slice(preCommaSlice![1]);
    }

    // Ending
    if (multiline) {
      this.decreaseDepth();
      ret += newlineFunc();
    } else if (opts.paddingForSingleLine) {
      ret += ' ';
    }

    if (!opts.noParens) {
      ret += opts.curlyBraces ? '}' : ')';
    }

    return ret;
  }
}
