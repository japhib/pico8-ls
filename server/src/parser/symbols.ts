import { getMemberExpressionName, TableConstructorExpression } from './expressions';
import { AssignmentStatement, Chunk, FunctionDeclaration, getFunctionDeclarationName, LocalStatement, Statement } from './statements';
import { Bounds } from './types';

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

export class SymbolFinder {
  // AST to parse
  chunk: Chunk;

  // List of symbols, populated after parsing.
  symbols: CodeSymbol[] = [];
  globalSymbols: Set<string> = new Set();
  localSymbols: Set<string>[] = [];

  constructor(chunk: Chunk) {
    this.chunk = chunk;
  }

  // Goes through and parses the symbol data from the AST.
  findSymbols(): CodeSymbol[] {
    this.findSymbolsInBlock(this.chunk.body);
    return this.symbols;
  }

  // some helper functions

  private getTopSymbolsScope(): Set<string> {
    if (this.localSymbols.length > 0) {
      return this.localSymbols[this.localSymbols.length - 1];
    }

    return this.globalSymbols;
  }

  private pushSymbolsScope() {
    this.localSymbols.push(new Set<string>());
  }

  private popSymbolsScope() {
    this.localSymbols.pop();
  }

  private isSymbolInLocalScope(symbolName: string) {
    if (this.localSymbols.length === 0) {
      return false;
    }

    return this.localSymbols[this.localSymbols.length - 1].has(symbolName);
  }

  private addSymbol(name: string, detail: string | undefined, type: CodeSymbolType, loc: Bounds, selectionLoc: Bounds, addToLocalScope: boolean, parent?: CodeSymbol): CodeSymbol {
    if (!name) {
      // This is validated by the client and causes the whole request to fail
      throw new Error('name cannot be falsey! ' + JSON.stringify({ detail, type, loc }));
    }

    const symbol: CodeSymbol = { name, detail, type, loc, selectionLoc, children: [] };
    if (parent) parent.children.push(symbol);
    else this.symbols.push(symbol);

    if (addToLocalScope) this.getTopSymbolsScope().add(name);

    return symbol;
  }

  // Actual functions for finding the symbols

  private findSymbolsInBlock(block: Statement[], parent?: CodeSymbol) {
    for (const statement of block) {
      switch (statement.type) {
      case 'FunctionDeclaration':
        this.findSymbolsInFunctionDefinition(statement, parent);
        break;

      case 'AssignmentStatement':
      case 'LocalStatement':
        this.findSymbolsInAssignment(statement, parent);
        break;
      }
    }
  }

  private findSymbolsInFunctionDefinition(statement: FunctionDeclaration, parent: CodeSymbol | undefined) {
    const name = getFunctionDeclarationName(statement);

    let funcSym = parent;

    // Only add the symbol if the function has a name
    if (statement.identifier) {
      // Add function signature as detail
      let detail = statement.parameters.map(param => {
        if (param.type === 'Identifier') return param.name;
        else return '...';
      }).join(',');
      detail = '(' + detail + ')';

      funcSym = this.addSymbol(
        name,
        detail,
        CodeSymbolType.Function,
        statement.loc!,
        statement.identifier.loc!,
        parent !== undefined,
        parent);
    }

    this.pushSymbolsScope();

    // Add a symbol for each parameter
    for (const param of statement.parameters) {
      // Don't care about vararg literals
      if (param.type !== 'Identifier')
        continue;
      this.addSymbol(
        param.name,
        undefined,
        CodeSymbolType.LocalVariable,
        param.loc!,
        param.loc!,
        true,
        funcSym);
    }

    this.findSymbolsInBlock(statement.body, funcSym);

    this.popSymbolsScope();
  }

  private findSymbolsInAssignment(statement: AssignmentStatement | LocalStatement, parent: CodeSymbol | undefined) {
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

      // clear parent if it's global
      const varParent = varLocal ? parent : undefined;

      const sym = this.addSymbol(
        name,
        undefined,
        varType,
        statement.loc!,
        variable.loc!,
        varLocal,
        varParent);

      // Now that we've added the symbol for the variable itself, check if it's being initialized to
      // a table and if so, add symbols for its members.
      if (initializer && initializer.type === 'TableConstructorExpression') {
        this.findSymbolsInTableConstructor(initializer, sym);
      }
    }
  }

  private findSymbolsInTableConstructor(expression: TableConstructorExpression, parent: CodeSymbol) {
    for (const field of expression.fields) {
      // Only add symbols for explicit string keys (without [])
      if (field.type !== 'TableKeyString') continue;

      const varType = field.value.type === 'FunctionDeclaration' ?
        CodeSymbolType.Function : CodeSymbolType.LocalVariable;

      this.addSymbol(
        field.key.name,
        undefined,
        varType,
        // The full location is from the beginning of the key to the end of the value
        { start: field.key.loc!.start, end: field.value.loc!.end },
        field.key.loc!,
        true,
        parent);
    }
  }
}
