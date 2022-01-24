import { getMemberExpressionName, TableConstructorExpression, TableKeyString } from './expressions';
import { AssignmentStatement, Chunk, ForGenericStatement, ForNumericStatement, FunctionDeclaration, getFunctionDeclarationName, LocalStatement } from './statements';
import { Bounds } from './types';
import { ASTVisitor } from './visitor';

export enum CodeSymbolType {
  Function = 'Function',
  LocalVariable = 'LocalVariable',
  GlobalVariable = 'GlobalVariable',
}

export type CodeSymbol = {
  name: string,
  detail: string | undefined,
  type: CodeSymbolType,

  // loc (from CodeSymbol) is the full bounds of the symbol, whereas
  // selectionLoc is what should be selected when you do `go to definition`.
  //
  // e.g.
  //     local asdf = 1
  //           ^  ^    - selection bounds (just variable name)
  //     ^            ^ - full bounds (whole statement)
  loc: Bounds,
  selectionLoc: Bounds,

  children: CodeSymbol[],
};

export function findSymbols(chunk: Chunk): CodeSymbol[] {
  return new SymbolFinder(chunk).findSymbols();
}

class SymbolScope {
  symbols: Set<string> = new Set();
  parent: CodeSymbol | undefined;

  constructor(parent: CodeSymbol | undefined) {
    this.parent = parent;
  }
}

class SymbolFinder extends ASTVisitor<SymbolScope> {
  // AST to parse
  chunk: Chunk;

  // List of symbols, populated after parsing.
  symbols: CodeSymbol[] = [];

  lastAddedSymbol: CodeSymbol | undefined;

  constructor(chunk: Chunk) {
    super();
    this.chunk = chunk;
  }

  // Goes through and parses the symbol data from the AST.
  findSymbols(): CodeSymbol[] {
    this.visit(this.chunk);
    return this.symbols;
  }

  createDefaultScope(): SymbolScope {
    // carry forward the current parent, if there is one
    return new SymbolScope(this.topScope() ? this.topScope().parent : undefined);
  }

  // some helper functions

  private isSymbolInLocalScope(symbolName: string) {
    if (this.scopeStack.length === 1) {
      return false;
    }

    return this.topScope().symbols.has(symbolName);
  }

  private addSymbol(name: string,
    detail: string | undefined,
    type: CodeSymbolType,
    loc: Bounds,
    selectionLoc: Bounds,
    addToLocalScope: boolean,
    parentOverride?: CodeSymbol,
  ): CodeSymbol {
    if (!name) {
      // This is validated by the client and causes the whole request to fail
      throw new Error('name cannot be falsey! ' + JSON.stringify({ detail, type, loc }));
    }

    const symbol: CodeSymbol = { name, detail, type, loc, selectionLoc, children: [] };

    const parent = parentOverride || this.getCurrentParent();
    if (parent && addToLocalScope)
      parent.children.push(symbol);
    else
      this.symbols.push(symbol);

    if (addToLocalScope) this.topScope().symbols.add(name);

    // Save for later just in case
    this.lastAddedSymbol = symbol;

    return symbol;
  }

  private getCurrentParent(): CodeSymbol | undefined {
    return this.topScope().parent;
  }

  private isInAssignment() {
    // Checks if the top 2 things on the stack are one of:
    //   - actual assignment: Identifier & (AssignmentStatement | LocalStatement)
    //   - pseudo assignment: TableKeyString & TableConstructorExpression

    const previous = this.topNode();
    const preprevious = this.topNode(1);

    return previous && preprevious
      && (
        (previous.type === 'Identifier' && (preprevious.type === 'AssignmentStatement' || preprevious.type === 'LocalStatement'))
        || (previous.type === 'TableKeyString' && preprevious.type === 'TableConstructorExpression')
      );
  }

  override visitFunctionDeclaration(statement: FunctionDeclaration): SymbolScope {
    // Add function signature as detail
    let functionSignature = statement.parameters.map(param => {
      if (param.type === 'Identifier') return param.name;
      else return '...';
    }).join(',');
    functionSignature = '(' + functionSignature + ')';

    // if it's an anonymous function that is assigned to something else, we'll
    // edit the previous symbol (the variable it's assigned to) instead of
    // adding a new one.
    let sym;
    if (!statement.identifier) {
      if (this.isInAssignment()) {
        sym = this.lastAddedSymbol;
        sym!.detail = functionSignature;
        sym!.type = CodeSymbolType.Function;
      }
    }

    if (!sym) {
      sym = this.addSymbol(
        getFunctionDeclarationName(statement),
        functionSignature,
        CodeSymbolType.Function,
        statement.loc!,
        statement.identifier ? statement.identifier.loc! : statement.loc!,
        this.getCurrentParent() !== undefined);
    }

    // add a symbol for each parameter as well
    for (const param of statement.parameters) {
      // except varargs
      if (param.type !== 'Identifier') continue;

      this.addSymbol(
        param.name,
        undefined,
        CodeSymbolType.LocalVariable,
        statement.loc!,
        statement.identifier ? statement.identifier.loc! : statement.loc!,
        true,
        sym);
    }

    return new SymbolScope(sym);
  }

  override visitAssignmentStatement(statement: AssignmentStatement) {
    this.findSymbolsInAssignment(statement);
  }

  override visitLocalStatement(statement: LocalStatement) {
    this.findSymbolsInAssignment(statement);
  }

  private findSymbolsInAssignment(statement: AssignmentStatement | LocalStatement) {
    const isLocal = statement.type === 'LocalStatement';

    for (let i = 0; i < statement.variables.length; i++) {
      const variable = statement.variables[i];
      if (variable.type !== 'MemberExpression' && variable.type !== 'Identifier') {
        // Don't create symbols for stuff like:
        //   a[b] = c
        continue;
      }

      const name = variable.type === 'MemberExpression' ? getMemberExpressionName(variable) : variable.name;

      const varLocal = isLocal || this.isSymbolInLocalScope(name);

      // Get variable type
      let varType = varLocal ? CodeSymbolType.LocalVariable : CodeSymbolType.GlobalVariable;
      // check initializer to see if it's actually a function
      const initializer = statement.init[i];
      if (initializer && initializer.type === 'FunctionDeclaration') {
        varType = CodeSymbolType.Function;
      }

      this.addSymbol(
        name,
        undefined,
        varType,
        statement.loc!,
        variable.loc!,
        varLocal);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override visitTableConstructorExpression(expression: TableConstructorExpression): SymbolScope {
    // If it's an assignment statement, as in:
    //    tbl = {}
    // then add a new scope with the name of the variable the table
    // is getting assigned to (e.g. tbl).
    if (this.isInAssignment()) {
      return new SymbolScope(this.lastAddedSymbol);
    }

    // If not, then no new scope, just add the default parent
    return this.createDefaultScope();
  }

  override visitTableKeyString(node: TableKeyString): void {
    this.addSymbol(
      node.key.name,
      undefined,
      CodeSymbolType.LocalVariable,
      node.loc!,
      node.loc!,
      true);
  }

  override visitForGenericStatement(node: ForGenericStatement): SymbolScope {
    for (const variable of node.variables) {
      this.addSymbol(
        variable.name,
        undefined,
        CodeSymbolType.LocalVariable,
        variable.loc!,
        variable.loc!,
        true);
    }

    return this.createDefaultScope();
  }

  override visitForNumericStatement(node: ForNumericStatement): SymbolScope {
    this.addSymbol(
      node.variable.name,
      undefined,
      CodeSymbolType.LocalVariable,
      node.variable.loc!,
      node.variable.loc!,
      true);

    return this.createDefaultScope();
  }
}
