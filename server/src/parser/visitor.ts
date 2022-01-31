/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { BinaryExpression, BooleanLiteral, CallExpression, Expression, GeneralTableField, getMemberExpressionName, Identifier, IndexExpression, LogicalExpression,
  MemberExpression, NilLiteral, NumericLiteral, StringCallExpression, StringLiteral, TableCallExpression,
  TableConstructorExpression, TableKey, TableKeyString, TableValue, UnaryExpression, VarargLiteral,
} from './expressions';
import { LabelStatement, BreakStatement, GotoStatement, ReturnStatement, IfStatement, WhileStatement,
  DoStatement, RepeatStatement, LocalStatement, AssignmentStatement, CallStatement, FunctionDeclaration,
  ForNumericStatement, ForGenericStatement, ElseClause, ElseifClause, IfClause, Chunk, GeneralIfClause, Statement,
} from './statements';
import { logObj } from './util';

export type VisitableASTNode = Statement | Expression | GeneralIfClause | GeneralTableField;

export enum NodeVisitingFlags {
  IsAssignmentTarget,
}

export type NodeGettingVisited = {
  node: VisitableASTNode,
  flags?: NodeVisitingFlags[],
};

// Defines the visitor pattern for all nodes in the AST structure.
//
// T is the type of thing we're tracking scopes with.
//
// There's a stack of T to keep track of all the scopes. Scope-creating visit
// functions have to return a value of type T, which gets pushed onto the stack.
export abstract class ASTVisitor<T> {
  // Scope tracking
  scopeStack: T[] = [];

  // Parent tracking.
  nodeStack: NodeGettingVisited[] = [];

  constructor() {
    this.scopeStack.push(this.startingScope());
  }

  topScope(idx?: number) {
    let offset = 1;
    if (idx) offset += idx;

    return this.scopeStack[this.scopeStack.length - offset];
  }

  topNode(idx?: number) {
    let offset = 1;
    if (idx) offset += idx;

    return this.nodeStack[this.nodeStack.length - offset];
  }

  // The starting value that gets pushed into the scope. Uses createDefaultScope
  // by default.
  startingScope(): T { return this.createDefaultScope(); }

  // The value that gets pushed onto the stack when entering a new scope
  // if you *don't* have a visitor defined for that function.
  abstract createDefaultScope(): T;

  private pushScope(value: T) {
    this.scopeStack.push(value);
    this.onEnterScope(value);
  }

  private popScope() {
    const scope = this.scopeStack.pop();
    this.onExitScope(scope!);
  }

  // Optional callbacks for executing logic when entering/exiting a scope
  onEnterScope(value: T) {}
  onExitScope(value: T) {}

  // helper functions

  // Checks if the top 2 things on the stack are one of:
  //   - actual assignment: (Identifier | MemberExpression) & (AssignmentStatement | LocalStatement)
  //   - pseudo assignment: TableKeyString & TableConstructorExpression
  isInAssignment(): boolean {
    const previous = this.topNode();
    const preprevious = this.topNode(1);

    return previous && preprevious
      && (
        ((previous.node.type === 'Identifier' || previous.node.type === 'MemberExpression')
          && (preprevious.node.type === 'AssignmentStatement' || preprevious.node.type === 'LocalStatement'))
        || (previous.node.type === 'TableKeyString' && preprevious.node.type === 'TableConstructorExpression')
      );
  }

  // Checks if the top thing on the stack has NodeVisitingFlags.IsAssignmentTarget set.
  //
  // Useful in situations like e.g.
  //
  //   a.b = c
  //
  // `b` and `c` will both get visited in visitIdentifier, and their parent will both be
  // the member expression `a.b`. However, when c gets visited, isInAssignmentTarget()
  // will return true.
  isInAssignmentTarget(): boolean {
    const previous = this.topNode();
    return !! previous?.flags?.includes(NodeVisitingFlags.IsAssignmentTarget);
  }

  // Scope-creating statements
  visitIfClause(node: IfClause): T { return this.createDefaultScope(); }
  visitElseifClause(node: ElseifClause): T { return this.createDefaultScope(); }
  visitElseClause(node: ElseClause): T { return this.createDefaultScope(); }
  visitDoStatement(node: DoStatement): T { return this.createDefaultScope(); }
  visitForGenericStatement(node: ForGenericStatement): T { return this.createDefaultScope(); }
  visitForNumericStatement(node: ForNumericStatement): T { return this.createDefaultScope(); }
  visitFunctionDeclaration(node: FunctionDeclaration): T { return this.createDefaultScope(); }
  visitRepeatStatement(node: RepeatStatement): T { return this.createDefaultScope(); }
  visitWhileStatement(node: WhileStatement): T { return this.createDefaultScope(); }
  visitTableConstructorExpression(node: TableConstructorExpression): T { return this.createDefaultScope(); }

  // Other Statements
  visitAssignmentStatement(node: AssignmentStatement): void {}
  visitBreakStatement(node: BreakStatement): void {}
  visitCallStatement(node: CallStatement): void {}
  visitGotoStatement(node: GotoStatement): void {}
  visitIfStatement(node: IfStatement): void {}
  visitLabelStatement(node: LabelStatement): void {}
  visitLocalStatement(node: LocalStatement): void {}
  visitReturnStatement(node: ReturnStatement): void {}

  // Expressions
  visitBinaryExpression(node: BinaryExpression): void {}
  visitBooleanLiteral(node: BooleanLiteral): void {}
  visitCallExpression(node: CallExpression): void {}
  visitIdentifier(node: Identifier): void {}
  visitIndexExpression(node: IndexExpression): void {}
  visitLogicalExpression(node: LogicalExpression): void {}
  visitMemberExpression(node: MemberExpression): void {}
  visitNilLiteral(node: NilLiteral): void {}
  visitNumericLiteral(node: NumericLiteral): void {}
  visitStringCallExpression(node: StringCallExpression): void {}
  visitStringLiteral(node: StringLiteral): void {}
  visitTableCallExpression(node: TableCallExpression): void {}
  visitTableKey(node: TableKey): void {}
  visitTableKeyString(node: TableKeyString): void {}
  visitTableValue(node: TableValue): void {}
  visitUnaryExpression(node: UnaryExpression): void {}
  visitVarargLiteral(node: VarargLiteral): void {}

  // Public entry point for kicking off visiting every node in the AST.
  visit(chunk: Chunk) {
    for (const statement of chunk.body)
      this.visitNode(statement);

  }

  private visitAll(nodes: VisitableASTNode[]) {
    for (const n of nodes) this.visitNode(n);
  }

  private visitNode(node: VisitableASTNode) {
    // console.log('\nvisitNode ' + node.type + ', node stack: [' + this.nodeStack.map(node => node.node.type).join(' | ') + ']');
    // logObj(node, 'current node');
    switch (node.type) {
    case 'AssignmentStatement':
      this.visitAssignmentStatement(node);

      this.nodeStack.push({ node });
      // We visit the variables & their initializers in order so like
      // variable1, init1, variable2, init2, etc.
      for (let i = 0; i < node.variables.length; i++) {
        this.visitNode(node.variables[i]);
        // The initializer can use the variable it's being assigned to as a parent
        this.nodeStack.push({ node: node.variables[i], flags: [NodeVisitingFlags.IsAssignmentTarget] });
        if (node.init[i]) this.visitNode(node.init[i]);
        this.nodeStack.pop();
      }
      this.nodeStack.pop();
      break;

    case 'BreakStatement':
      this.visitBreakStatement(node);
      break;

    case 'CallStatement':
      this.visitCallStatement(node);
      this.nodeStack.push({ node });
      if (node.expression) this.visitNode(node.expression);
      this.nodeStack.pop();
      break;

    case 'DoStatement': {
      const result = this.visitDoStatement(node);
      this.nodeStack.push({ node });
      this.pushScope(result);
      this.visitAll(node.body);
      this.popScope();
      this.nodeStack.pop();
      break;
    }

    case 'ForGenericStatement': {
      const result = this.visitForGenericStatement(node);

      this.nodeStack.push({ node });
      this.pushScope(result);

      // Visit the variables and their initializers in order (var1, init1, var2, init2)
      for (let i = 0; i < node.variables.length; i++) {
        this.visitNode(node.variables[i]);
        if (node.iterators[i]) this.visitNode(node.iterators[i]);
      }

      this.visitAll(node.body);
      this.popScope();
      this.nodeStack.pop();
      break;
    }

    case 'ForNumericStatement': {
      const result = this.visitForNumericStatement(node);
      this.nodeStack.push({ node });
      this.pushScope(result);
      this.visitNode(node.variable);
      this.visitNode(node.start);
      this.visitNode(node.end);
      if (node.step) this.visitNode(node.step);
      this.visitAll(node.body);
      this.popScope();
      this.nodeStack.pop();
      break;
    }

    case 'FunctionDeclaration': {
      const result = this.visitFunctionDeclaration(node);
      this.nodeStack.push({ node });

      // Only visit the function declaration identifier if it's a member expression.
      // Everything else can be taken care of in visitFunctionDeclaration.
      if (node.identifier && node.identifier.type === 'MemberExpression')
        this.visitNode(node.identifier);

      this.pushScope(result);
      this.visitAll(node.parameters);
      this.visitAll(node.body);
      this.popScope();
      this.nodeStack.pop();
      break;
    }

    case 'GotoStatement':
      this.visitGotoStatement(node);
      this.nodeStack.push({ node });
      this.visitNode(node.label);
      this.nodeStack.pop();
      break;

    case 'IfStatement':
      this.visitIfStatement(node);
      this.nodeStack.push({ node });
      this.visitAll(node.clauses);
      this.nodeStack.pop();
      break;

    case 'IfClause': {
      const result = this.visitIfClause(node);
      this.nodeStack.push({ node });
      this.visitNode(node.condition);
      this.pushScope(result);
      this.visitAll(node.body);
      this.popScope();
      this.nodeStack.pop();
      break;
    }

    case 'ElseifClause': {
      const result = this.visitElseifClause(node);
      this.nodeStack.push({ node });
      this.visitNode(node.condition);
      this.pushScope(result);
      this.visitAll(node.body);
      this.popScope();
      this.nodeStack.pop();
      break;
    }

    case 'ElseClause': {
      const result = this.visitElseClause(node);
      this.nodeStack.push({ node });
      this.pushScope(result);
      this.visitAll(node.body);
      this.popScope();
      this.nodeStack.pop();
      break;
    }

    case 'LabelStatement':
      this.visitLabelStatement(node);
      this.nodeStack.push({ node });
      this.visitNode(node.label);
      this.nodeStack.pop();
      break;

    case 'LocalStatement':
      this.visitLocalStatement(node);

      this.nodeStack.push({ node });
      // We visit the variables & their initializers in order so like
      // variable1, init1, variable2, init2, etc.
      for (let i = 0; i < node.variables.length; i++) {
        this.visitNode(node.variables[i]);
        // The initializer can use the variable it's being assigned to as a parent
        this.nodeStack.push({ node: node.variables[i], flags: [NodeVisitingFlags.IsAssignmentTarget] });
        if (node.init[i]) this.visitNode(node.init[i]);
        this.nodeStack.pop();
      }
      this.nodeStack.pop();
      break;

    case 'RepeatStatement': {
      const result = this.visitRepeatStatement(node);
      this.nodeStack.push({ node });
      this.pushScope(result);
      this.visitAll(node.body);
      this.popScope();

      // Condition gets visited afterwards since it's `repeat ... until <condition>`
      this.visitNode(node.condition);
      this.nodeStack.pop();
      break;
    }

    case 'ReturnStatement':
      this.visitReturnStatement(node);
      this.nodeStack.push({ node });
      this.visitAll(node.arguments);
      this.nodeStack.pop();
      break;

    case 'WhileStatement': {
      const result = this.visitWhileStatement(node);
      this.nodeStack.push({ node });
      this.visitNode(node.condition);
      this.pushScope(result);
      this.visitAll(node.body);
      this.popScope();
      this.nodeStack.pop();
      break;
    }

    case 'BinaryExpression':
      this.visitBinaryExpression(node);
      this.nodeStack.push({ node });
      this.visitNode(node.left);
      this.visitNode(node.right);
      this.nodeStack.pop();
      break;

    case 'BooleanLiteral':
      this.visitBooleanLiteral(node);
      break;

    case 'CallExpression':
      this.visitCallExpression(node);
      this.nodeStack.push({ node });
      this.visitNode(node.base);
      this.visitAll(node.arguments);
      this.nodeStack.pop();
      break;

    case 'Identifier':
      this.visitIdentifier(node);
      break;

    case 'IndexExpression':
      this.visitIndexExpression(node);
      this.nodeStack.push({ node });
      this.visitNode(node.base);
      this.visitNode(node.index);
      this.nodeStack.pop();
      break;

    case 'LogicalExpression':
      this.visitLogicalExpression(node);
      this.nodeStack.push({ node });
      this.visitNode(node.left);
      this.visitNode(node.right);
      this.nodeStack.pop();
      break;

    case 'MemberExpression':
      this.visitMemberExpression(node);
      this.nodeStack.push({ node });
      this.visitNode(node.base);
      this.visitNode(node.identifier);
      this.nodeStack.pop();
      break;

    case 'NilLiteral':
      this.visitNilLiteral(node);
      break;

    case 'NumericLiteral':
      this.visitNumericLiteral(node);
      break;

    case 'StringCallExpression':
      this.visitStringCallExpression(node);
      this.nodeStack.push({ node });
      this.visitNode(node.base);
      this.visitNode(node.argument);
      this.nodeStack.pop();
      break;

    case 'StringLiteral':
      this.visitStringLiteral(node);
      break;

    case 'TableCallExpression':
      this.visitTableCallExpression(node);
      this.nodeStack.push({ node });
      this.visitNode(node.base);
      this.visitNode(node.arguments);
      this.nodeStack.pop();
      break;

    case 'TableConstructorExpression': {
      const result = this.visitTableConstructorExpression(node);
      this.nodeStack.push({ node });
      this.pushScope(result);
      this.visitAll(node.fields);
      this.popScope();
      this.nodeStack.pop();
      break;
    }

    case 'TableKey':
      this.visitTableKey(node);
      this.nodeStack.push({ node });
      this.visitNode(node.key);
      this.visitNode(node.value);
      this.nodeStack.pop();
      break;

    case 'TableKeyString':
      this.visitTableKeyString(node);
      this.nodeStack.push({ node });
      this.visitNode(node.value);
      this.nodeStack.pop();
      break;

    case 'TableValue':
      this.visitTableValue(node);
      this.nodeStack.push({ node });
      this.visitNode(node.value);
      this.nodeStack.pop();
      break;

    case 'UnaryExpression':
      this.visitUnaryExpression(node);
      this.nodeStack.push({ node });
      this.visitNode(node.argument);
      this.nodeStack.pop();
      break;

    case 'VarargLiteral':
      this.visitVarargLiteral(node);
      break;

    default:
      throw new Error('Unexpected node type: ' + (node as any).type);
    }
  }
}
