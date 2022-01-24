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
  loc: Bounds,
  type: CodeSymbolType,
  children: CodeSymbol[],
};
