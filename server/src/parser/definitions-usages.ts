/* eslint-disable @typescript-eslint/no-unsafe-call */

import { createWarning, errMessages, Warning } from './errors';
import { getMemberExpresionBaseIdentifier, getMemberExpressionName, getMemberExpressionParentName, Identifier, MemberExpression, TableConstructorExpression } from './expressions';
import { AssignmentStatement, Chunk, ForGenericStatement, ForNumericStatement, FunctionDeclaration, getBareFunctionDeclarationName, LocalStatement } from './statements';
import { Bounds, boundsEqual } from './types';
import { ASTVisitor } from './visitor';
import Builtins from './builtins';
import { logObj } from './util';

export type DefinitionsUsages = {
  symbolName: string,
  definitions: Bounds[],
  usages: Bounds[],
};

function emptyDefinitionsUsages(symbolName: string): DefinitionsUsages {
  return { symbolName, definitions: [], usages: [] };
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

class DefUsageScope {
  name: string | undefined;
  symbols: Map<string, DefinitionsUsages>;
  self: string | undefined;

  constructor(arg: { name?: string, self?: string, symbols?: Map<string, DefinitionsUsages> }) {
    this.name = arg.name;
    this.self = arg.self;
    this.symbols = arg.symbols || new Map<string, DefinitionsUsages>();
  }

  get(key: string) {
    return this.symbols.get(key);
  }

  set(key: string, value: DefinitionsUsages) {
    return this.symbols.set(key, value);
  }

  has(key: string) {
    return this.symbols.has(key);
  }

  keys() {
    return this.symbols.keys();
  }
}

class DefinitionsUsagesFinder extends ASTVisitor<DefUsageScope> {
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

  override startingScope(): DefUsageScope {
    const predefinedGlobals = new Map<string, DefinitionsUsages>();
    for (const fnName in Builtins)
      predefinedGlobals.set(fnName, emptyDefinitionsUsages(fnName));
    return new DefUsageScope({ symbols: predefinedGlobals });
  }

  override createDefaultScope(): DefUsageScope {
    // carry forward the current self and name, if they exist
    const self = this.topScope()?.self;
    const name = this.topScope()?.name;
    return new DefUsageScope({ self, name });
  }

  findDefinitionsUsages(): { defUs: DefinitionsUsagesLookup, warnings: Warning[] } {
    this.visit(this.chunk);
    this.resolveEarlyRefs();
    return {
      defUs: this.lookup,
      warnings: this.warnings,
    };
  }

  resolveEarlyRefs() {
    for (const earlyRef in this.earlyRefs) {
      let symbolName = earlyRef;
      const usages = this.earlyRefs[earlyRef];

      if (!this.isSymbolDefined(symbolName)) {
        if (symbolName.indexOf('.') === -1) {
          // Only create warnings for non-member variables
          usages.forEach(loc => {
            this.warnings.push(createWarning(loc, errMessages.undefinedVariable, symbolName));
          });
        } else {
          // Change symbolName to only the last identifier. e.g. `tbl.key` => `key`
          const parts = symbolName.split('.');
          symbolName = parts[parts.length - 1];

          // if it's still undefined, create a new symbol without a definition
          if (!this.globalScope().has(symbolName))
            this.globalScope().set(symbolName, { symbolName, definitions: [], usages: [] });
        }
      }

      usages.forEach(loc => { this.addUsage(symbolName, loc); });
    }
  }

  override onExitScope(scope: DefUsageScope): void {
    for (const variableName of scope.keys()) {
      const defsUsages = scope.get(variableName)!;
      if (defsUsages.usages.length <= 1) {
        // Create an 'unused local' warning on the definition
        const definition = defsUsages.definitions[0];
        this.warnings.push(createWarning(definition, errMessages.unusedLocal, variableName));
      }
    }
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

  private getScopeOf(symbolName: string): DefUsageScope | undefined {
    // Note global scope (i=0) *is* considered.
    for (let i = this.scopeStack.length - 1; i >= 0; i--)
      if (this.scopeStack[i].has(symbolName)) return this.scopeStack[i];

    return undefined;
  }

  private globalScope() {
    return this.scopeStack[0];
  }

  private addDefinition(symbolName: string, loc: Bounds, scopeOverride?: DefUsageScope) {
    // Note that if we're outside any function block (scopeStack only has 1
    // element), a 'local' variable will still be global
    const scopeToAddTo = scopeOverride || this.topScope();

    let defUs = scopeToAddTo.get(symbolName);
    if (defUs) {
      // Definition/usages lists already exist, just add this occurrence to the lists
      defUs.definitions.push(loc);
      defUs.usages.push(loc);
    } else {
      // Definition/usages lists don't already exist. Create them and add to scope.
      defUs = {
        symbolName,
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

    if (!defUs) {
      // Symbol is not defined so it's an early global ref, which could turn
      // into a warning if unused
      this.addEarlyRef(symbolName, loc);
      return;
    }

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

  override visitFunctionDeclaration(node: FunctionDeclaration): DefUsageScope {
    // If the function has an identifier, that's the name.
    let name = node.identifier && getBareFunctionDeclarationName(node);
    let loc = node.identifier && node.identifier.loc!;

    // Determine new value for "self" if possible
    let self = undefined;
    if (node.identifier?.type === 'MemberExpression') {
      // It's something like `function blah:fun() ...`
      // So self should be `blah`
      self = getMemberExpressionParentName(node.identifier);
    }
    else if (!node.identifier && this.isInAssignment()) {
      const previous = this.topNode().node;

      // first check if we're in an assignment to a member expression
      if (previous.type === 'MemberExpression') {
        self = getMemberExpressionParentName(previous);
      }
      else if (previous.type === 'TableKeyString') {
        // use the scope name (name of the table getting assigned to)
        self = this.topScope().name;
      }
    }

    // If the function does NOT have an identifier, but we're in an assignment
    // or in a table constructor, use the variable name that we're being
    // assigned to.
    if (!name && this.isInAssignment()) {
      const previous = this.topNode().node;
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
      this.addDefinition(name, loc!, this.globalScope());
    }

    // Set name to undefined? TODO maybe fix
    return new DefUsageScope({ self, name: undefined });
  }

  override visitIdentifier(node: Identifier): void {
    const topNode = this.topNode()?.node;
    // Special case: function parameter
    if (topNode?.type === 'FunctionDeclaration') {
      this.addDefinition(node.name, node.loc!, undefined);
      return;
    }
    // Special case: member expression. This is handled in visitMemberExpression
    // so don't re-process it again here.
    if (topNode?.type === 'MemberExpression' && !this.isInAssignmentTarget())
      return;

    this.addUsage(node.name, node.loc!);
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
        this.defsForMemberExpressionAssignment(variable);

      // Else, no-op. Don't create defs/usages for stuff like:
      //   a[b] = c
      // (at least not on the assignment level. `a` in the example above
      // would still get picked up by visitIdentifier)
    }
  }

  private defsForSimpleAssignment(variable: Identifier, statement: AssignmentStatement | LocalStatement) {
    const name = variable.name;
    if (statement.type === 'LocalStatement' || !this.isSymbolDefined(name))
      this.addDefinition(name, variable.loc!, statement.type === 'LocalStatement' ? undefined : this.globalScope());
    else
      this.addUsage(name, variable.loc!);
  }

  private defsForMemberExpressionAssignment(memberExpression: MemberExpression) {
    let name = getMemberExpressionName(memberExpression) || `self.${memberExpression.identifier.name}`;

    // Figure out what the base is
    const base = getMemberExpresionBaseIdentifier(memberExpression);
    // Base isn't an identifier, so we can't add a definition for it
    let baseName = base?.name;

    // resolve "self" references if possible
    const scopedSelf = this.topScope().self;
    if (baseName === 'self' && scopedSelf) {
      baseName = scopedSelf;
      name = name?.replace(/\bself\b/, scopedSelf);
    }

    // Add usage of the base name since it's getting referenced
    if (base && baseName) this.addUsage(baseName, base.loc!);

    // Note we add the definition to the global scope.
    // Some examples:
    //
    //   function set_a(v)
    //     v.a = 1
    //   end
    //
    //   function use_local()
    //     loc_table = {}
    //     loc_table.a = 1
    //     return loc_table
    //   end
    //
    // In both examples, the `a` member of the table could end up getting used
    // anywhere else in the file. So it's more useful to have it be global.
    this.addDefinition(name, memberExpression.loc!, this.globalScope());
  }

  override visitForGenericStatement(node: ForGenericStatement): DefUsageScope {
    // Add symbols for variables created in the for statement
    for (const variable of node.variables)
      this.addDefinition(variable.name, variable.loc!);

    return this.createDefaultScope();
  }

  override visitForNumericStatement(node: ForNumericStatement): DefUsageScope {
    // Add symbols for the variable created in the for statement
    this.addDefinition(node.variable.name, node.variable.loc!);

    return this.createDefaultScope();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override visitTableConstructorExpression(node: TableConstructorExpression): DefUsageScope {
    // If it's an assignment statement, as in:
    //    tbl = {}
    // then add a new scope with the name of the variable the table
    // is getting assigned to (e.g. tbl).
    if (this.isInAssignment()) {
      // carry forward the current self and name, if they exist
      const self = this.topScope()?.self;
      let name = this.topScope()?.name;

      // Set new scope name to what the table is getting assigned to.
      const topNode = this.topNode().node;
      switch (topNode.type) {
      case 'Identifier': name = topNode.name; break;
      case 'TableKeyString': name = topNode.key.name; break;
      case 'MemberExpression':
        const membExprName = getMemberExpressionName(topNode);
        if (membExprName) name = membExprName;
        break;
      }
      return new DefUsageScope({ name, self });
    }

    // If not, then no new scope, just add the default parent
    return this.createDefaultScope();
  }

  override visitMemberExpression(membExpr: MemberExpression): void {
    // If we're in an assignment statement, the member expression has already
    // been taken care of. So we don't worry about it.
    if (this.isInAssignment()) return;

    // If we're in the identifier of a function declaration, it's also already
    // been taken care of
    if (this.topNode() && this.topNode().node.type === 'FunctionDeclaration') return;

    // Add usage of base if it's an identifier
    const base = getMemberExpresionBaseIdentifier(membExpr);
    let name = getMemberExpressionName(membExpr) || `self.${membExpr.identifier.name}`;
    let baseName = base?.name;

    // resolve "self" references if possible
    const scopedSelf = this.topScope().self;
    if (baseName === 'self' && scopedSelf) {
      baseName = scopedSelf;
      name = name.replace(/\bself\b/, scopedSelf);
    }

    // Add usage of the base name since it's getting referenced
    if (base && baseName) this.addUsage(baseName, base.loc!);

    // Add usage of the full thing
    this.addUsage(name, membExpr.loc!);
  }
}
