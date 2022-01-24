export type CodeLocation = {
  line: number,
  column: number,
  index: number,
};

export type Bounds = {
  start: CodeLocation,
  end: CodeLocation,
};

export type ASTNode = {
  loc?: Bounds,
};

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
