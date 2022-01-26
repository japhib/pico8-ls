/* eslint-disable @typescript-eslint/no-unsafe-call */

import { getMemberExpressionName, Identifier } from './expressions';
import { Chunk, FunctionDeclaration, getBareFunctionDeclarationName } from './statements';
import { Bounds, boundsEqual } from './types';
import { ASTVisitor } from './visitor';

export type DefinitionsUsages = {
  definitions: Bounds[],
  usages: Bounds[],
};

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
        && column <= def.loc.end.column) {
        return def.defUs;
      }
    }

    return undefined;
  }
}

export function findDefinitionsUsages(chunk: Chunk): DefinitionsUsagesLookup {
  return new DefinitionsUsagesFinder(chunk).findDefinitionsUsages();
}

type SymbolsInScope = Map<string, DefinitionsUsages>;

class DefinitionsUsagesFinder extends ASTVisitor<SymbolsInScope> {
  // AST to parse
  chunk: Chunk;

  // List of symbols
  lookup: DefinitionsUsagesLookup = new DefinitionsUsagesLookup();

  constructor(chunk: Chunk) {
    super();
    this.chunk = chunk;
  }

  findDefinitionsUsages(): DefinitionsUsagesLookup {
    this.visit(this.chunk);
    return this.lookup;
  }

  // some helpers

  private isSymbolLocal(symbolName: string): boolean {
    // Note we stop *before* i gets to 0, so the global scope (i=0) is not
    // considered
    for (let i = this.scopeStack.length - 1; i > 0; i--) {
      if (this.scopeStack[i].has(symbolName)) return true;
    }
    return false;
  }

  private isSymbolDefined(symbolName: string): boolean {
    // Note global scope (i=0) *is* considered.
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      if (this.scopeStack[i].has(symbolName)) return true;
    }
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
      if (!boundsEqual(loc, defUs.usages[defUs.usages.length - 1]))
        defUs.definitions.push(loc);
    }

    // Add another reference to the definitions/usages from the current usage location
    this.lookup.add(loc, defUs);
  }

  // Visitor implementation

  override createDefaultScope(): SymbolsInScope {
    return new Map<string, DefinitionsUsages>();
  }

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
    if (this.isSymbolDefined(node.name)) this.addUsage(node.name, node.loc!);
  }
}