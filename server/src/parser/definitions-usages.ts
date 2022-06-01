/* eslint-disable @typescript-eslint/no-unsafe-call */

import { createWarning, errMessages, Warning } from './errors';
import { getMemberExpresionBaseIdentifier, getMemberExpressionName, getMemberExpressionParentName, Identifier, MemberExpression, TableConstructorExpression, TableKeyString } from './expressions';
import { AssignmentStatement, Chunk, ForGenericStatement, ForNumericStatement, FunctionDeclaration, getBareFunctionDeclarationName, LocalStatement } from './statements';
import { Bounds, boundsEqual, boundsSize, CodeLocation } from './types';
import { ASTVisitor, VisitableASTNode } from './visitor';
import { BuiltinConstants, Builtins } from './builtins';

export type DefinitionsUsagesResult = {
  definitionsUsages: DefinitionsUsagesLookup,
  warnings: Warning[],
  scopes: DefUsageScope,
};

export type DefinitionsUsages = {
  symbolName: string,
  definitions: Bounds[],
  usages: Bounds[],
};

function emptyDefinitionsUsages(symbolName: string): DefinitionsUsages {
  return { symbolName, definitions: [], usages: [] };
}

export type DefinitionsUsagesWithLocation = {
  loc: Bounds,
  defUs: DefinitionsUsages,
};

export type DefinitionsUsagesOnLine = DefinitionsUsagesWithLocation[];

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
    const line = this.getLine(loc.start.line);

    // First check to make sure that there isn't already an item with that name/bounds
    for (const defUsages of line) {
      if (defUsages.defUs.symbolName === defUs.symbolName
        && boundsEqual(defUsages.loc, loc)) {
        // Name & location is the same, so merge usages/definitions instead of adding them.
        this.addLocationsIfNotExists(defUs.definitions, defUsages.defUs.definitions);
        this.addLocationsIfNotExists(defUs.usages, defUsages.defUs.usages);
        return;
      }
    }

    // If we've made it this far, it's not been found, so just add it
    line.push({ loc, defUs });
  }

  addLocationsIfNotExists(locs: Bounds[], list: Bounds[]) {
    for (const loc of locs) {
      let shouldAdd = true;

      // Only adds the location if it isn't already in the list
      for (const item of list) {
        if (boundsEqual(loc, item)) {
          shouldAdd = false;
          break;
        }
      }

      if (shouldAdd) {
        list.push(loc);
      }
    }
  }

  lookup(line: number, column: number): DefinitionsUsages | undefined {
    const defUsOnLine = this.lines[line];

    // Can't find the line, don't bother adding it to the list, just return
    if (!defUsOnLine) {
      return undefined;
    }

    let found: DefinitionsUsagesWithLocation | undefined = undefined;

    for (const def of defUsOnLine) {
      const matches = line === def.loc.start.line
        && column >= def.loc.start.column
        && column <= def.loc.end.column;

      // Make sure we find the match with the narrowest bounds
      // TODO: maybe keep the list sorted so this is more efficient
      // (sorting would introduce more work in the AST scanning phase though)
      const narrower = !found || boundsSize(found.loc) > boundsSize(def.loc);

      if (matches && narrower) {
        found = def;
      }
    }

    return found?.defUs;
  }
}

export function findDefinitionsUsages(chunk: Chunk, dontAddGlobalSymbols?: boolean): DefinitionsUsagesResult {
  return new DefinitionsUsagesFinder(chunk, dontAddGlobalSymbols).findDefinitionsUsages();
}

export enum DefUsagesScopeType {
  Global = 'Global',
  Function = 'Function',
  Table = 'Table',
  Other = 'Other',
}

export class DefUsageScope {
  type: DefUsagesScopeType;
  name: string | undefined;
  symbols: Map<string, DefinitionsUsages>;
  self: string | undefined;
  loc: Bounds | null;
  children: DefUsageScope[] = [];
  parent: DefUsageScope | undefined;

  constructor(type: DefUsagesScopeType, loc: Bounds | null, arg: { name?: string, self?: string, symbols?: Map<string, DefinitionsUsages> }) {
    this.type = type;
    this.loc = loc;
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

  contains(codeLocation: CodeLocation): boolean {
    // It's only null for the global scope, in which case all code locations are contained
    if (this.loc === null) {
      return true;
    }

    const withinLines = codeLocation.line >= this.loc.start.line && codeLocation.line <= this.loc.end.line;
    if (!withinLines) {
      return false;
    }

    // one-line scope
    if (this.loc.start.line === this.loc.end.line) {
      return codeLocation.column >= this.loc.start.column && codeLocation.column <= this.loc.end.column;
    }

    // First line
    if (codeLocation.line === this.loc.start.line) {
      return codeLocation.column >= this.loc.start.column;
    }

    // last line
    if (codeLocation.line === this.loc.end.line) {
      return codeLocation.column <= this.loc.end.column;
    }

    // it's on a middle line, columns don't matter
    return true;
  }

  lookupScopeFor(codeLocation: CodeLocation): DefUsageScope {
    for (const childScope of this.children) {
      // If any of the children match, recurse into that child.
      // This way we find the narrowest scope that matches a given code location.
      if (childScope.contains(codeLocation)) {
        return childScope.lookupScopeFor(codeLocation);
      }
    }

    // If we've gotten this far, there are no children, or none of the children
    // match. So the current scope is the best match.
    return this;
  }

  // Returns a list of all symbols in scope at that moment, including the
  // current scope and all its parents.
  allSymbols(): string[] {
    const symbols: string[] = [];
    let current: DefUsageScope | undefined = this;
    while (current) {
      symbols.push(...current.symbols.keys());
      current = current.parent;
    }
    return symbols;
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

  // Flag for not adding global PICO-8 functions like fillp, spr, map, etc.
  // Used for testing, to make the output more clear.
  dontAddGlobalSymbols: boolean;

  // If the global DefUsageScope is injected from another file (i.e. this file
  // is #include'd by another file)
  injectedGlobalScope: DefUsageScope | undefined;

  constructor(chunk: Chunk, dontAddGlobalSymbols?: boolean, injectedGlobalScope?: DefUsageScope) {
    super();
    this.chunk = chunk;
    this.dontAddGlobalSymbols = !!dontAddGlobalSymbols;
    this.injectedGlobalScope = injectedGlobalScope;
  }

  // External entry point
  findDefinitionsUsages(): DefinitionsUsagesResult {
    this.visit(this.chunk);
    this.resolveEarlyRefs();
    return {
      definitionsUsages: this.lookup,
      warnings: this.warnings,
      scopes: this.scopeStack[0],
    };
  }

  override startingScope(): DefUsageScope {
    if (this.injectedGlobalScope) {
      return this.injectedGlobalScope;
    }

    const predefinedGlobals = new Map<string, DefinitionsUsages>();

    if (!this.dontAddGlobalSymbols) {
      for (const fnName in Builtins) {
        predefinedGlobals.set(fnName, emptyDefinitionsUsages(fnName));
      }
      for (const fnName of BuiltinConstants) {
        predefinedGlobals.set(fnName, emptyDefinitionsUsages(fnName));
      }
    }

    return new DefUsageScope(DefUsagesScopeType.Global, null, { symbols: predefinedGlobals });
  }

  override createDefaultScope(scopeNode: VisitableASTNode | null, type?: DefUsagesScopeType): DefUsageScope {
    type = type || DefUsagesScopeType.Other;

    // carry forward the current self and name, if they exist
    const self = this.topScope()?.self;
    const name = this.topScope()?.name;
    return new DefUsageScope(type, scopeNode?.loc || null, { self, name });
  }

  // Called to finish resolving early refs.
  resolveEarlyRefs() {
    for (const origSymbolName in this.earlyRefs) {
      let symbolName = origSymbolName;
      const usages = this.earlyRefs[origSymbolName];

      const isMemberExpression = symbolName.indexOf('.') !== -1;

      while (!this.isSymbolDefined(symbolName)) {
        // If it's a member expression, try chopping off the first part of the member expression
        // until it's just one long. e.g. `a.b.c` => try `a.b.c`, then `b.c`, then just `c`.

        if (symbolName.indexOf('.') === -1) {
          break;
        }

        const parts = symbolName.split('.');
        symbolName = parts.slice(1).join('.');
      }

      if (!this.isSymbolDefined(symbolName)) {
        if (!isMemberExpression && symbolName !== 'self') {
          // Only create warnings for non-member variables
          usages.forEach(loc => {
            this.warnings.push(createWarning(loc, errMessages.undefinedVariable, origSymbolName));
          });
        }

        // if it's still undefined, create a new symbol without a definition
        if (!this.globalScope().has(symbolName)) {
          this.globalScope().set(symbolName, { symbolName, definitions: [], usages: [] });
        }
      }

      usages.forEach(loc => {
        this.addUsage(symbolName, loc);
      });
    }
  }

  override onEnterScope(enteringScope: DefUsageScope): void {
    // Add this scope to the children of the parent scope (one scope down)
    this.topScope(1).children.push(enteringScope);
    enteringScope.parent = this.topScope(1);
  }

  override onExitScope(scope: DefUsageScope): void {
    // Don't bother checking for locals if it's a table "scope" (not a real scope)
    if (scope.type === DefUsagesScopeType.Table) {
      return;
    }

    // TODO re-enable this when bugs are fixed
    // // check for unused locals
    // for (const variableName of scope.keys()) {
    //   const defsUsages = scope.get(variableName)!;
    //   if (defsUsages.usages.length <= 1) {
    //     // Create an 'unused local' warning on the definition
    //     const definition = defsUsages.definitions[0];
    //     this.warnings.push(createWarning(definition, errMessages.unusedLocal, variableName));
    //   }
    // }
  }

  // some helpers

  private isSymbolLocal(symbolName: string): boolean {
    // Note we stop *before* i gets to 0, so the global scope (i=0) is NOT
    // considered
    for (let i = this.scopeStack.length - 1; i > 0; i--) {
      if (this.scopeStack[i].has(symbolName)) {
        return true;
      }
    }

    return false;
  }

  private isSymbolDefined(symbolName: string): boolean {
    // Note global scope (i=0) *is* considered.
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      if (this.scopeStack[i].has(symbolName)) {
        return true;
      }
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
      if (ret) {
        return ret;
      }
    }
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
        definitions: [ loc ],
        usages: [ loc ],
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
    if (!boundsEqual(loc, defUs.usages[defUs.usages.length - 1])) {
      defUs.usages.push(loc);
    }

    // if it's a global variable getting reassigned, add it to the definitions list as well
    if (!this.isSymbolLocal(symbolName) && this.isInAssignment() && !this.isInAssignmentTarget()) {
      // Don't add the usage if it's the exact same as the most recent one added
      if (!boundsEqual(loc, defUs.definitions[defUs.definitions.length - 1])) {
        defUs.definitions.push(loc);
      }
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
    } else if (!node.identifier && this.isInAssignment()) {
      // If the function does NOT have an identifier, but we're in an assignment
      // or in a table constructor, use the variable name that we're being
      // assigned to. We also can get the value from `self` based on the
      // variable name we're being assigned to.
      const previous = this.topNode().node;
      switch (previous.type) {
      case 'Identifier':
        name = previous.name;
        loc = previous.loc!;
        break;
      case 'MemberExpression':
        self = getMemberExpressionParentName(previous);
        name = getMemberExpressionName(previous) || previous.identifier.name;
        loc = previous.loc!;
        break;
      case 'TableKeyString':
        name = previous.key.name;
        loc = previous.key.loc!;
        // use the scope name (name of the table getting assigned to)
        self = this.topScope().name;
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

    // Set name to undefined? TODO make sure this is what we want
    return new DefUsageScope(DefUsagesScopeType.Function, node.loc!, { self, name: name || undefined });
  }

  override visitIdentifier(node: Identifier): void {
    const topNode = this.topNode()?.node;
    // Special case: function parameter
    if (topNode?.type === 'FunctionDeclaration') {
      this.addDefinition(node.name, node.loc!, undefined);
      return;
    }
    // Special case: member expression. This is handled in visitMemberExpression
    // so don't re-process it again here. (Unless we're in an assignment target.)
    if (topNode?.type === 'MemberExpression' && !this.isInAssignmentTarget()) {
      return;
    }

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

      if (variable.type === 'Identifier') {
        this.defsForSimpleAssignment(variable, statement);
      } else if (variable.type === 'MemberExpression') {
        this.defsForMemberExpressionAssignment(variable);
      }

      // Else, no-op. Don't create defs/usages for stuff like:
      //   a[b] = c
      // (at least not on the assignment level. `a` in the example above
      // would still get picked up by visitIdentifier)
    }
  }

  private defsForSimpleAssignment(variable: Identifier, statement: AssignmentStatement | LocalStatement) {
    const name = variable.name;
    if (statement.type === 'LocalStatement' || !this.isSymbolDefined(name)) {
      this.addDefinition(name, variable.loc!, statement.type === 'LocalStatement' ? undefined : this.globalScope());
    } else {
      this.addUsage(name, variable.loc!);
    }
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
    if (base && baseName) {
      this.addUsage(baseName, base.loc!);
    }

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
    for (const variable of node.variables) {
      this.addDefinition(variable.name, variable.loc!);
    }

    return this.createDefaultScope(node);
  }

  override visitForNumericStatement(node: ForNumericStatement): DefUsageScope {
    // Add symbols for the variable created in the for statement
    this.addDefinition(node.variable.name, node.variable.loc!);

    return this.createDefaultScope(node);
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
        if (membExprName) {
          name = membExprName;
        }
        break;
      }
      return new DefUsageScope(DefUsagesScopeType.Table, node.loc!, { name, self });
    }

    // If not, then no new scope, just add the default parent
    return this.createDefaultScope(node, DefUsagesScopeType.Table);
  }

  override visitTableKeyString(node: TableKeyString): void {
    this.addDefinition(node.key.name, node.key.loc!);
  }

  override visitMemberExpression(membExpr: MemberExpression): void {
    // If we're in an assignment statement, the member expression has already
    // been taken care of. So we don't worry about it.
    if (this.isInAssignment()) {
      return;
    }

    // Add usage(s) of base(s)
    this.addUsagesOfBases(membExpr);

    // Add usage of the full thing
    const { name } = this.resolveSelf(membExpr);
    this.addUsage(name, membExpr.loc!);
  }

  // Add a usage for each "base" this member expression has.
  // e.g. `a.b.c.d` => add usages for `a.b.c`, `a.b`, and `a`
  addUsagesOfBases(memberExpression: MemberExpression) {
    let current = memberExpression.base;
    while (true) {
      switch (current.type) {
      case 'Identifier':
        // this is the base identifier. Add usage and stop iterating.
        this.addUsage(current.name, current.loc!);
        return;

      case 'MemberExpression':
        // Add usage for entire member expression
        // (Use "self" for base name if it's something weird like "getter().something")
        const name = getMemberExpressionName(current) || `self.${current.identifier.name}`;
        this.addUsage(name, current.loc!);
        // Keep recursing
        current = current.base;
        break;

      default:
        // It's something other than an identifier or member expression
        return;
      }
    }
  }

  // TODO is baseName ever used?
  resolveSelf(membExpr: MemberExpression): { name: string, baseName: string | undefined } {
    const base = getMemberExpresionBaseIdentifier(membExpr);
    let name = getMemberExpressionName(membExpr) || `self.${membExpr.identifier.name}`;
    let baseName = base?.name;

    // resolve "self" references if possible
    const scopedSelf = this.topScope().self;
    if (baseName === 'self' && scopedSelf) {
      baseName = scopedSelf;
      name = name.replace(/\bself\b/, scopedSelf);
    }

    return { name, baseName };
  }
}
