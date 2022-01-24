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
