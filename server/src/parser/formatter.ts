import {
  AssignmentStatement, BreakStatement, CallStatement, Chunk,
  DoStatement, ElseClause, ElseifClause, ForGenericStatement, ForNumericStatement,
  FunctionDeclaration, GeneralIfClause,
  GotoStatement,
  IfClause,
  IfStatement, LabelStatement,
  LocalStatement, RepeatStatement, ReturnStatement, Statement,
  WhileStatement,
} from './statements';
import {
  BinaryExpression,
  BooleanLiteral,
  CallExpression,
  Expression,
  GeneralTableField,
  Identifier,
  IndexExpression,
  LogicalExpression,
  MemberExpression,
  NilLiteral,
  NumericLiteral,
  StringCallExpression,
  StringLiteral,
  TableCallExpression,
  TableConstructorExpression,
  TableKey,
  TableKeyString,
  TableValue,
  UnaryExpression,
  VarargLiteral,
} from './expressions';
import { uinteger } from 'vscode-languageserver-types';

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

// TODO: consider moving formatter to its separate folder parallel to parser, then move shared statements and expressions outside parser as well

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
    return chunk.body.map(s => this.visitStatement(s)).join('\n');
  }

  newline() {
    return '\n' + this.tabsForDepth();
  }

  tabsForDepth(): string {
    let ret = '';
    for (let i = 0; i < this.currentIndent; i++) ret += this.tab;
    return ret;
  }

  increaseDepth() {
    this.currentIndent++;
  }

  decreaseDepth() {
    this.currentIndent--;
  }

  visitStatement(node: Statement): string {
    switch (node.type) {
    case 'AssignmentStatement': return this.visitAssignmentStatement(node);
    case 'BreakStatement': return this.visitBreakStatement(node);
    case 'CallStatement': return this.visitCallStatement(node);
    case 'DoStatement': return this.visitDoStatement(node);
    case 'ForGenericStatement': return this.visitForGenericStatement(node);
    case 'ForNumericStatement': return this.visitForNumericStatement(node);
    case 'FunctionDeclaration': return this.visitFunctionDeclaration(node, true);
    case 'GotoStatement': return this.visitGotoStatement(node);
    case 'IfStatement': return this.visitIfStatement(node);
    case 'LabelStatement': return this.visitLabelStatement(node);
    case 'LocalStatement': return this.visitLocalStatement(node);
    case 'RepeatStatement': return this.visitRepeatStatement(node);
    case 'ReturnStatement': return this.visitReturnStatement(node);
    case 'WhileStatement': return this.visitWhileStatement(node);
    default: throw new Error('Unexpected statement type: ' + (node as any).type);
    }
  }

  visitBlock(stmts: Statement[], begin?: string, skipEnd?: boolean): string {
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
    default: throw new Error('Unexpected if clause type: ' + (node as any).type);
    }
  }

  visitExpression(node: Expression): string {
    switch (node.type) {
    case 'FunctionDeclaration': return this.visitFunctionDeclaration(node, false);
    case 'BinaryExpression': return this.visitBinaryExpression(node);
    case 'BooleanLiteral': return this.visitBooleanLiteral(node);
    case 'CallExpression': return this.visitCallExpression(node);
    case 'IndexExpression': return this.visitIndexExpression(node);
    case 'Identifier': return this.visitIdentifier(node);
    case 'LogicalExpression': return this.visitLogicalExpression(node);
    case 'MemberExpression': return this.visitMemberExpression(node);
    case 'NilLiteral': return this.visitNilLiteral(node);
    case 'NumericLiteral': return this.visitNumericLiteral(node);
    case 'StringCallExpression': return this.visitStringCallExpression(node);
    case 'StringLiteral': return this.visitStringLiteral(node);
    case 'TableCallExpression': return this.visitTableCallExpression(node);
    case 'TableConstructorExpression': return this.visitTableConstructorExpression(node);
    case 'UnaryExpression': return this.visitUnaryExpression(node);
    case 'VarargLiteral': return this.visitVarargLiteral(node);
    default: throw new Error('Unexpected expression type: ' + (node as any).type);
    }
  }

  visitGeneralTableField(node: GeneralTableField): string {
    switch (node.type) {
    case 'TableKey': return this.visitTableKey(node);
    case 'TableKeyString': return this.visitTableKeyString(node);
    case 'TableValue': return this.visitTableValue(node);
    default: throw new Error('Unexpected table field type: ' + (node as any).type);
    }
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
    ret += ' ';
    ret += node.operator ?? '=';
    ret += ' ';
    ret += init.join(', ');
    return ret;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  visitBreakStatement(node: BreakStatement): string {
    return 'break';
  }

  visitCallStatement(node: CallStatement): string {
    if (!node.expression) throw new Error('Can\'t visit CallStatement with null expression!');

    return this.visitExpression(node.expression);
  }

  visitDoStatement(node: DoStatement): string {
    return this.visitBlock(node.body);
  }

  visitForGenericStatement(node: ForGenericStatement): string {
    const variables = node.variables.map(v => this.visitExpression(v));
    const iterators = node.iterators.map(v => this.visitExpression(v));

    let ret = 'for ';
    ret += variables.join(', ');
    ret += ' in ';
    ret += iterators.join(', ');
    ret += ' ';
    ret += this.visitBlock(node.body);
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
    ret += this.visitBlock(node.body);
    return ret;
  }

  visitGotoStatement(node: GotoStatement): string {
    return 'goto ' + this.visitIdentifier(node.label);
  }

  visitIfStatement(node: IfStatement): string {
    if (node.oneLine && node.clauses.length === 1 && node.clauses[0].body.length === 1) {
      const clause = node.clauses[0] as IfClause;
      return `if (${this.visitExpression(clause.condition)}) ${this.visitStatement(clause.body[0])}`;
    }

    let ret = '';
    for (const clause of node.clauses) ret += this.visitGeneralIfClause(clause);
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
    let ret = this.visitBlock(node.body, 'repeat', true);
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
    ret += this.visitBlock(node.body, ' do');
    return ret;
  }

  // ****************************** If Clauses *****************************

  visitIfClause(node: IfClause): string {
    let ret = 'if ';
    ret += this.visitExpression(node.condition);
    ret += this.visitBlock(node.body, ' then', true);
    ret += this.newline();
    return ret;
  }

  visitElseifClause(node: ElseifClause): string {
    let ret = 'elseif ';
    ret += this.visitExpression(node.condition);
    ret += this.visitBlock(node.body, ' then', true);
    ret += this.newline();
    return ret;
  }

  visitElseClause(node: ElseClause): string {
    return this.visitBlock(node.body, 'else', true) + this.newline();
  }

  // ****************************** Literals *****************************

  visitBooleanLiteral(node: BooleanLiteral): string {
    return node.value ? 'true' : 'false;';
  }

  visitNilLiteral(node: NilLiteral): string {
    return 'nil';
  }

  visitNumericLiteral(node: NumericLiteral): string {
    return node.raw;
  }

  visitStringLiteral(node: StringLiteral): string {
    return node.raw;
  }

  visitVarargLiteral(node: VarargLiteral): string {
    return '...';
  }

  // ****************************** Expressions *****************************

  visitBinaryExpression(node: BinaryExpression): string {
    return `${this.visitExpression(node.left)} ${node.operator} ${this.visitExpression(node.right)}`;
  }

  visitCallExpression(node: CallExpression): string {
    return `${this.visitExpression(node.base)}(${node.arguments.map(a => this.visitExpression(a)).join(', ')})`;
  }

  visitFunctionDeclaration(node: FunctionDeclaration, isStatement: boolean): string {
    let ret = 'function';
    if (node.identifier) ret += ' ' + this.visitExpression(node.identifier);
    ret += '(' + node.parameters.map(a => this.visitExpression(a)).join(', ') + ')';

    this.increaseDepth();

    for (const stmt of node.body) {
      ret += this.newline();
      ret += this.visitStatement(stmt);
    }

    this.decreaseDepth();
    ret += this.newline();
    ret += 'end';

    if (isStatement) ret += this.newline();

    return ret;
  }

  visitIdentifier(node: Identifier): string {
    return node.name;
  }

  visitIndexExpression(node: IndexExpression): string {
    return `${this.visitExpression(node.base)}[${this.visitExpression(node.index)}]`;
  }

  visitLogicalExpression(node: LogicalExpression): string {
    return `${this.visitExpression(node.left)} ${node.operator} ${this.visitExpression(node.right)}`;
  }

  visitMemberExpression(node: MemberExpression): string {
    return this.visitExpression(node.base) + node.indexer + this.visitIdentifier(node.identifier);
  }

  visitStringCallExpression(node: StringCallExpression): string {
    return this.visitExpression(node.base) + ' ' + this.visitStringLiteral(node.argument);
  }

  visitTableCallExpression(node: TableCallExpression): string {
    return this.visitExpression(node.base) + ' ' + this.visitTableConstructorExpression(node.arguments);
  }

  visitTableConstructorExpression(node: TableConstructorExpression): string {
    const shouldIndent = node.fields.length > 1;
    const newlineFunc = shouldIndent ? this.newline.bind(this) : () => '';

    let ret = '{';
    if (shouldIndent) this.increaseDepth();

    let first = true;
    for (const f of node.fields) {
      if (!first) ret += ',' + (shouldIndent ? '' : ' ');
      first = false;
      ret += newlineFunc();
      ret += this.visitGeneralTableField(f);
    }

    if (shouldIndent) this.decreaseDepth();
    ret += newlineFunc();
    ret += '}';
    return ret;
  }

  visitUnaryExpression(node: UnaryExpression): string {
    return `${node.operator}${this.visitExpression(node.argument)}`;
  }

  // ****************************** Table Values *****************************

  visitTableKey(node: TableKey): string {
    return '[' + this.visitExpression(node.key) + '] = ' + this.visitExpression(node.value);
  }

  visitTableKeyString(node: TableKeyString): string {
    return this.visitIdentifier(node.key) + ' = ' + this.visitExpression(node.value);
  }

  visitTableValue(node: TableValue): string {
    return this.visitExpression(node.value);
  }
}
