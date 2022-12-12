/* eslint-disable @typescript-eslint/no-unsafe-call */

import { getMemberExpressionName, Identifier, MemberExpression, TableConstructorExpression, TableKeyString } from './expressions';
import { AssignmentStatement, Chunk, ForGenericStatement, ForNumericStatement, FunctionDeclaration, getFunctionDeclarationName, LabelStatement, LocalStatement } from './statements';
import { Bounds } from './types';
import { ASTVisitor } from './visitor';

export enum CodeSymbolType {
  Function = 'Function',
  LocalVariable = 'LocalVariable',
  LocalTable = 'LocalTable',
  LocalArray = 'LocalArray',
  GlobalVariable = 'GlobalVariable',
  GlobalTable = 'GlobalTable',
  GlobalArray = 'GlobalArray',
  Label = 'Label',
}

export type CodeSymbol = {
  name: string,
  sig: string,
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
  params?: string[]
};

export function findSymbols(chunk: Chunk): CodeSymbol[] {
  return new SymbolFinder(chunk).findSymbols();
}

class SymbolScope {
  symbols: Set<string> = new Set<string>();
  parent: CodeSymbol | undefined;
  self: string | undefined;

  constructor(parent: CodeSymbol | undefined, self: string | undefined) {
    this.parent = parent;
    this.self = self;
  }
}

enum VariableType {
  Plain = 0,
  Function = 1,
  Table = 2,
  Array = 3,
}

class SymbolFinder extends ASTVisitor<SymbolScope> {
  // AST to parse
  chunk: Chunk;

  // List of symbols
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
    // carry forward the current parent & self, if there is one
    if (this.topScope()) {
      return new SymbolScope(this.topScope().parent, this.topScope().self);
    } else {
      return new SymbolScope(undefined, undefined);
    }
  }

  // some helper functions

  private isSymbolInLocalScope(symbolName: string) {
    for (let i = this.scopeStack.length - 1; i > 0; i--) {
      if (this.scopeStack[i].symbols.has(symbolName)) {
        return true;
      }
    }

    return false;
  }

  private addSymbol(name: string,
    sig:string | undefined,
    detail: string | undefined,
    type: CodeSymbolType,
    loc: Bounds,
    selectionLoc: Bounds,
    addToLocalScope: boolean,
    parentOverride?: CodeSymbol,
    params?:string[],
  ): CodeSymbol {
    if (!name) {
      // This is validated by the client and causes the whole request to fail
      throw new Error('name cannot be falsey! ' + JSON.stringify({ detail, type, loc }));
    }

    const symbol: CodeSymbol = { name, sig: sig ?? name, detail, type, loc, selectionLoc, children: [], params };

    const parent = parentOverride || this.getCurrentParent();
    if (parent && addToLocalScope) {
      parent.children.push(symbol);
    } else {
      this.symbols.push(symbol);
    }

    if (addToLocalScope) {
      this.topScope().symbols.add(name);
    }

    // Save for later just in case
    this.lastAddedSymbol = symbol;

    return symbol;
  }

  private getCurrentParent(): CodeSymbol | undefined {
    return this.topScope().parent;
  }

  override visitFunctionDeclaration(statement: FunctionDeclaration): SymbolScope {
    if (!statement.identifier && this.isInAssignment()) {
      return this.visitFunctionDeclarationWithoutIdentifier(statement);
    } else {
      return this.visitFunctionDeclarationWithIdentifier(statement);
    }
  }

  private visitFunctionDeclarationWithIdentifier(statement: FunctionDeclaration): SymbolScope {
    // determine what "self" value should be used
    let self = undefined;
    if (statement.identifier?.type === 'MemberExpression' && statement.identifier.indexer === ':') {
      const base = statement.identifier.base;
      if (base.type === 'Identifier') {
        self = base.name;
      } else if (base.type === 'MemberExpression') {
        self = getMemberExpressionName(base);
      } else {
        throw new Error('Unreachable');
      } // sanity check
    }
    const name = getFunctionDeclarationName(statement);
    const sig = name + this.getFunctionSignature(statement);
    const detail = ''; //statement.description;

    const params =statement.parameters
      .filter((p): p is Identifier=>p.type=='Identifier')
      .map(p => p.name);

    const sym = this.addSymbol(
      name,
      sig,
      detail,
      CodeSymbolType.Function,
      statement.loc!,
      statement.identifier ? statement.identifier.loc! : statement.loc!,
      this.getCurrentParent() !== undefined,
      undefined,
      params,
    );

    return new SymbolScope(sym, self);
  }

  private visitFunctionDeclarationWithoutIdentifier(statement: FunctionDeclaration): SymbolScope {
    // it's an anonymous function that is assigned to something else, so we'll
    // edit the previous symbol (the variable this function is assigned to)
    // instead of adding a new one.

    const sym = this.lastAddedSymbol!;
    sym.detail = this.getFunctionSignature(statement);
    sym.type = CodeSymbolType.Function;

    let self = undefined;
    const symNameParts = sym.name.split(/[.:]/);
    if (symNameParts.length > 1) {
      self = symNameParts.slice(0, symNameParts.length - 1).join('.');
    } else {
      self = this.topScope().parent?.name;
    }

    return new SymbolScope(sym, self);
  }

  private getFunctionSignature(statement: FunctionDeclaration): string {
    let functionSignature = statement.parameters.map(param => {
      if (param.type === 'Identifier') {
        return param.name;
      } else {
        return '...';
      }
    }).join(',');
    functionSignature = '(' + functionSignature + ')';
    return functionSignature;
  }

  // override visitIdentifier(node: Identifier): void {
  //   // We only care about identifiers when they are the parameters of a function declaration.
  //   if (this.topNode() && this.topNode().node.type === 'FunctionDeclaration') {
  //     this.addSymbol(
  //       node.name,
  //       undefined,
  //       CodeSymbolType.LocalVariable,
  //       node.loc!,
  //       node.loc!,
  //       true);
  //   }
  // }

  override visitAssignmentStatement(statement: AssignmentStatement) {
    this.findSymbolsInAssignment(statement);
  }

  override visitLocalStatement(statement: LocalStatement) {
    this.findSymbolsInAssignment(statement);
  }

  private findSymbolsInAssignment(statement: AssignmentStatement | LocalStatement) {
    for (let i = 0; i < statement.variables.length; i++) {
      const variable = statement.variables[i];

      // check initializer to see if it's actually a function
      let vtype = VariableType.Plain;

      // isFunction
      if (statement.init[i] && statement.init[i].type === 'FunctionDeclaration') {
        vtype = VariableType.Function;
      }
      // isTable
      if (statement.init[i] && statement.init[i].type === 'TableConstructorExpression') {
        vtype = VariableType.Table;

        // isArray
        if ((<TableConstructorExpression>statement.init[i]).fields.length > 0
          && (<TableConstructorExpression>statement.init[i]).fields.every(f => f.type === 'TableValue')) {
          vtype = VariableType.Array;
        }
      }

      if (variable.type === 'Identifier') {
        this.addSymbolForSimpleAssignment(variable, statement, vtype);
      } else if (variable.type === 'MemberExpression') {
        this.addSymbolForMemberExpressionAssignment(variable, statement as AssignmentStatement, vtype);
      }

      // Else, no-op. Don't create symbols for stuff like:
      //   a[b] = c
    }
  }

  private addSymbolForSimpleAssignment(variable: Identifier, statement: AssignmentStatement | LocalStatement, variableType: VariableType) {
    const name = variable.name;

    const varLocal = statement.type === 'LocalStatement' || this.isSymbolInLocalScope(name);
    // Get variable type
    let varType = varLocal ? CodeSymbolType.LocalVariable : CodeSymbolType.GlobalVariable;
    let varStr = varLocal ? '(local ' : '(global ';
    // override variable type if it's a function
    if (variableType == VariableType.Function) {
      varType = CodeSymbolType.Function;
      varStr += 'function)';
    } else if (variableType == VariableType.Table) {
      varType = varLocal ? CodeSymbolType.LocalTable : CodeSymbolType.GlobalTable;
      varStr += 'table)';
    } else if (variableType == VariableType.Array) {
      varType = varLocal ? CodeSymbolType.LocalArray : CodeSymbolType.GlobalArray;
      varStr += 'array)';
    } else {
      varStr += 'variable)';
    }

    this.addSymbol(
      name,
      `${varStr} ${name}`,
      undefined,
      varType,
      statement.loc!,
      variable.loc!,
      varLocal);
  }

  private addSymbolForMemberExpressionAssignment(memberExpression: MemberExpression, statement: AssignmentStatement, variableType: VariableType) {
    // Figure out what the base is so we can see if it's in local scope
    let baseName: string;
    let base = memberExpression.base;
    // This is a while loop since it could be deeply nested.
    //    a.b.c = true
    // In that case we want baseName to be 'a', and the symbol name to be 'a.b.c'
    foundBaseName: while (true) {
      switch (base.type) {
      case 'Identifier': baseName = base.name; break foundBaseName;
      case 'MemberExpression': base = base.base; break;
      default:
        // It's something other than an identifier or member expression, so we can't add a symbol for it
        return;
      }
    }

    let symbolName = getMemberExpressionName(memberExpression)!;
    // resolve "self" references if possible
    const scopedSelf = this.topScope().self;
    if (baseName === 'self' && scopedSelf) {
      baseName = scopedSelf;
      symbolName = symbolName.replace(/\bself\b/, scopedSelf);
    }

    const varLocal = this.isSymbolInLocalScope(baseName);

    // Get variable type
    let varType = varLocal ? CodeSymbolType.LocalVariable : CodeSymbolType.GlobalVariable;
    // override variable type if it's a function
    let varStr = varLocal ? '(local ' : '(global ';
    // override variable type if it's a function
    if (variableType == VariableType.Function) {
      varType = CodeSymbolType.Function;
      varStr += 'function)';
    } else if (variableType == VariableType.Table) {
      varType = varLocal ? CodeSymbolType.LocalTable : CodeSymbolType.GlobalTable;
      varStr += 'table)';
    } else if (variableType == VariableType.Array) {
      varType = varLocal ? CodeSymbolType.LocalArray : CodeSymbolType.GlobalArray;
      varStr += 'array)';
    } else {
      varStr += 'variable)';
    }

    this.addSymbol(
      symbolName,
      `${varStr} ${symbolName}`,
      undefined,
      varType,
      statement.loc!,
      memberExpression.loc!,
      varLocal);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override visitTableConstructorExpression(expression: TableConstructorExpression): SymbolScope {
    // If it's an assignment statement, as in:
    //    tbl = {}
    // then add a new scope with the name of the variable the table
    // is getting assigned to (e.g. tbl).
    if (this.isInAssignment()) {
      return new SymbolScope(this.lastAddedSymbol, undefined);
    }

    // If not, then no new scope, just add the default parent
    return this.createDefaultScope();
  }

  override visitTableKeyString(node: TableKeyString): void {
    this.addSymbol(
      node.key.name,
      undefined,
      undefined,
      CodeSymbolType.LocalVariable,
      node.loc!,
      node.loc!,
      true);
  }

  // override visitForGenericStatement(node: ForGenericStatement): SymbolScope {
  //   // Add symbols for variables created in the for statement
  //   for (const variable of node.variables) {
  //     this.addSymbol(
  //       variable.name,
  //       undefined,
  //       CodeSymbolType.LocalVariable,
  //       variable.loc!,
  //       variable.loc!,
  //       true);
  //   }

  //   return this.createDefaultScope();
  // }

  // override visitForNumericStatement(node: ForNumericStatement): SymbolScope {
  //   // Add symbols for the variable created in the for statement
  //   this.addSymbol(
  //     node.variable.name,
  //     undefined,
  //     CodeSymbolType.LocalVariable,
  //     node.variable.loc!,
  //     node.variable.loc!,
  //     true);

  //   return this.createDefaultScope();
  // }

  override visitLabelStatement(node: LabelStatement): void {
    this.addSymbol(
      node.label.name,
      undefined,
      undefined,
      CodeSymbolType.Label,
      node.loc!,
      node.loc!,
      true);
  }
}
