/* eslint-disable @typescript-eslint/no-unsafe-call */

import { createWarning, errMessages, Warning } from './errors';
import { getMemberExpressionName, Identifier, MemberExpression } from './expressions';
import { AssignmentStatement, Chunk, ForGenericStatement, ForNumericStatement, FunctionDeclaration, getBareFunctionDeclarationName, LocalStatement } from './statements';
import { Bounds, boundsEqual } from './types';
import { ASTVisitor } from './visitor';
import Builtins from './builtins';

export type DefinitionsUsages = {
  definitions: Bounds[],
  usages: Bounds[],
};

function emptyDefinitionsUsages(): DefinitionsUsages {
  return { definitions: [], usages: [] };
}

export type DefinitionsUsagesOnLine = {
  loc: Bounds,
  defUs: DefinitionsUsages,
}[];

export class DefinitionsUsagesLookup {
  lines: DefinitionsUsagesOnLine[] = [];

  getLine(line: number): DefinitionsUsagesOnLine {
    let defUsOnLine = this.lines[line];
    if (!defUsOnLine) {
      defUsOnLine = [];
      this.lines[line] = defUsOnLine;
    }

    return defUsOnLine;
  }

  add(loc: Bounds, defUs: DefinitionsUsages) {
    this.getLine(loc.start.line).push({ loc, defUs });
  }

  lookup(line: number, column: number): DefinitionsUsages | undefined {
    const defUsOnLine = this.lines[line];

    // Can't find the line, don't bother adding it to the list, just return
    if (!defUsOnLine) return undefined;

    for (const def of defUsOnLine) {
      if (line === def.loc.start.line
        && column >= def.loc.start.column
        && column <= def.loc.end.column)
        return def.defUs;

    }

    return undefined;
  }
}

export function findDefinitionsUsages(chunk: Chunk): { defUs: DefinitionsUsagesLookup, warnings: Warning[] } {
  return new DefinitionsUsagesFinder(chunk).findDefinitionsUsages();
}

type SymbolsInScope = Map<string, DefinitionsUsages>;

class DefinitionsUsagesFinder extends ASTVisitor<SymbolsInScope> {
  // AST to parse
  chunk: Chunk;

  // List of symbols
  lookup: DefinitionsUsagesLookup = new DefinitionsUsagesLookup();

  // List of globals that have been referenced but not defined yet
  earlyRefs: { [key: string]: Bounds[] } = {};

  // Errors that occurred while determining definitions & usages
  // (just undefined variables so far)
  warnings: Warning[] = [];

  constructor(chunk: Chunk) {
    super();
    this.chunk = chunk;
  }

  override startingScope(): SymbolsInScope {
    const predefinedGlobals = new Map<string, DefinitionsUsages>();
    for (const fnName in Builtins)
      predefinedGlobals.set(fnName, emptyDefinitionsUsages());
    return predefinedGlobals;
  }

  override createDefaultScope(): SymbolsInScope {
    return new Map<string, DefinitionsUsages>();
  }

  findDefinitionsUsages(): { defUs: DefinitionsUsagesLookup, warnings: Warning[] } {
    this.visit(this.chunk);

    // resolve early global refs
    for (const earlyRef in this.earlyRefs) {
      if (!this.isSymbolDefined(earlyRef)) {
        this.earlyRefs[earlyRef].forEach(loc => {
          this.warnings.push(createWarning(loc, errMessages.undefinedGlobal, earlyRef));
        });
      } else {
        this.earlyRefs[earlyRef].forEach(loc => {
          this.addUsage(earlyRef, loc);
        });
      }
    }

    return {
      defUs: this.lookup,
      warnings: this.warnings,
    };
  }

  // some helpers

  private isSymbolLocal(symbolName: string): boolean {
    // Note we stop *before* i gets to 0, so the global scope (i=0) is not
    // considered
    for (let i = this.scopeStack.length - 1; i > 0; i--)
      if (this.scopeStack[i].has(symbolName)) return true;

    return false;
  }

  private isSymbolDefined(symbolName: string): boolean {
    // Note global scope (i=0) *is* considered.
    for (let i = this.scopeStack.length - 1; i >= 0; i--)
      if (this.scopeStack[i].has(symbolName)) return true;

    return false;
  }

  private getSymbolDef(symbolName: string): DefinitionsUsages | undefined {
    // Iterate in reverse order to find the top-most scope that it is declared
    // in.
    //
    // Note the global scope (i=0) *is* considered.
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const ret = this.scopeStack[i].get(symbolName);
      if (ret) return ret;
    }
    return undefined;
  }

  private addDefinition(symbolName: string, loc: Bounds, isGlobal: boolean) {
    // Note that if we're outside any function block (scopeStack only has 1
    // element), a 'local' variable will still be global
    const scopeToAddTo = isGlobal ? this.scopeStack[0] : this.topScope();

    let defUs = scopeToAddTo.get(symbolName);
    if (defUs) {
      // Definition/usages lists already exist, just add this occurrence to the lists
      defUs.definitions.push(loc);
      defUs.usages.push(loc);
    } else {
      // Definition/usages lists don't already exist. Create them and add to scope.
      defUs = {
        definitions: [loc],
        usages: [loc],
      };
      scopeToAddTo.set(symbolName, defUs);
    }

    // Add to lookup table too
    this.lookup.add(loc, defUs);
  }

  private addUsage(symbolName: string, loc: Bounds) {
    const defUs = this.getSymbolDef(symbolName);

    // At this point, we should've already ensured that the symbol was defined,
    // but we'll do a sanity check anyway
    if (!defUs)
      throw new Error(`addUsage called with not-yet-defined symbol: ${symbolName} at ${loc.start.line}:${loc.start.column}`);

    // Don't add the usage if it's the exact same as the most recent one added
    if (!boundsEqual(loc, defUs.usages[defUs.usages.length - 1]))
      defUs.usages.push(loc);

    // if it's a global variable getting reassigned, add it to the definitions list as well
    if (!this.isSymbolLocal(symbolName) && this.isInAssignment()) {
      // Don't add the usage if it's the exact same as the most recent one added
      if (!boundsEqual(loc, defUs.definitions[defUs.definitions.length - 1]))
        defUs.definitions.push(loc);
    }

    // Add another reference to the definitions/usages from the current usage location
    this.lookup.add(loc, defUs);
  }

  private addEarlyRef(symbolName: string, loc: Bounds) {
    let list = this.earlyRefs[symbolName];
    if (!list) {
      list = [];
      this.earlyRefs[symbolName] = list;
    }
    list.push(loc);
  }

  // Visitor implementation

  override visitFunctionDeclaration(node: FunctionDeclaration): SymbolsInScope {
    // If the function has an identifier, that's the name.
    let name = node.identifier && getBareFunctionDeclarationName(node);
    let loc = node.identifier && node.identifier.loc!;

    // If the function does NOT have an identifier, but we're in an assignment
    // or in a table constructor, use the variable name that we're being
    // assigned to.
    if (!name && this.isInAssignment()) {
      const previous = this.topNode();
      switch (previous.type) {
      case 'Identifier':
        name = previous.name;
        loc = previous.loc!;
        break;
      case 'MemberExpression':
        name = getMemberExpressionName(previous) || previous.identifier.name;
        loc = previous.loc!;
        break;
      case 'TableKeyString':
        name = previous.key.name;
        loc = previous.loc!;
        break;
      default:
        // this shouldn't happen
        throw new Error(`Unexpected previous node type after checking isInAssignment: ${previous.type}`);
      }
    }

    // Now at this point if we have a name we can add the definition.
    if (name) {
      // All function definitions go in the global namespace for simplicity. It's
      // not technically correct, but makes it so if you have something like this:
      //
      //   function init() ... end
      //   player = {
      //     init = function() ... end
      //   }
      //
      // then a call to init() will know it can go to either one.
      this.addDefinition(name, loc!, true);
    }

    return this.createDefaultScope();
  }

  override visitIdentifier(node: Identifier): void {
    // Special case: function parameter
    if (this.topNode() && this.topNode().type === 'FunctionDeclaration') {
      this.addDefinition(node.name, node.loc!, false);
      return;
    }

    if (this.isSymbolDefined(node.name)) this.addUsage(node.name, node.loc!);
    else this.addEarlyRef(node.name, node.loc!);
  }

  override visitAssignmentStatement(statement: AssignmentStatement): void {
    this.defsForAssignment(statement);
  }

  override visitLocalStatement(statement: LocalStatement): void {
    this.defsForAssignment(statement);
  }

  private defsForAssignment(statement: AssignmentStatement | LocalStatement): void {
    for (let i = 0; i < statement.variables.length; i++) {
      const variable = statement.variables[i];

      if (variable.type === 'Identifier')
        this.defsForSimpleAssignment(variable, statement);
      else if (variable.type === 'MemberExpression')
        this.defsForMemberExpressionAssignment(variable, statement as AssignmentStatement);

      // Else, no-op. Don't create defs/usages for stuff like:
      //   a[b] = c
      // (at least not on the assignment level. `a` in the example above
      // would still get picked up by visitIdentifier)
    }
  }

  private defsForSimpleAssignment(variable: Identifier, statement: AssignmentStatement | LocalStatement) {
    const name = variable.name;
    if (statement.type === 'LocalStatement' || !this.isSymbolDefined(name))
      this.addDefinition(name, variable.loc!, statement.type === 'LocalStatement');
    else
      this.addUsage(name, variable.loc!);

  }

  private defsForMemberExpressionAssignment(memberExpression: MemberExpression, statement: AssignmentStatement) {
    // // Figure out what the base is so we can see if it's in local scope
    // let baseName: string;
    // let base = memberExpression.base;
    // // This is a while loop since it could be deeply nested.
    // //    a.b.c = true
    // // In that case we want baseName to be 'a', and the symbol name to be 'a.b.c'
    // foundBaseName: while (true) {
    //   switch (base.type) {
    //   case 'Identifier': baseName = base.name; break foundBaseName;
    //   case 'MemberExpression': base = base.base; break;
    //   default:
    //     // It's something other than an identifier or member expression, so we can't add a symbol for it
    //     return;
    //   }
    // }

    // let symbolName = getMemberExpressionName(memberExpression)!;
    // // resolve "self" references if possible
    // const scopedSelf = this.topScope().self;
    // if (baseName === 'self' && scopedSelf) {
    //   baseName = scopedSelf;
    //   symbolName = symbolName.replace(/\bself\b/, scopedSelf);
    // }

    // const isLocal = this.isSymbolInLocalScope(baseName);

    // // Get variable type
    // let varType = isLocal ? CodeSymbolType.LocalVariable : CodeSymbolType.GlobalVariable;
    // // override variable type if it's a function
    // if (isFunction) varType = CodeSymbolType.Function;

    // this.addSymbol(
    //   symbolName,
    //   undefined,
    //   varType,
    //   statement.loc!,
    //   memberExpression.loc!,
    //   isLocal);
  }

  override visitForGenericStatement(node: ForGenericStatement): SymbolsInScope {
    // Add symbols for variables created in the for statement
    for (const variable of node.variables)
      this.addDefinition(variable.name, variable.loc!, false);

    return this.createDefaultScope();
  }

  override visitForNumericStatement(node: ForNumericStatement): SymbolsInScope {
    // Add symbols for the variable created in the for statement
    this.addDefinition(node.variable.name, node.variable.loc!, false);

    return this.createDefaultScope();
  }
}
