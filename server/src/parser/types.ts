export type CodeLocation = {
  line: number,
  column: number,
  index: number,
};

export function codeLocationsEqual(a: CodeLocation, b: CodeLocation): boolean {
  return a.line === b.line && a.column === b.column && a.index === b.index;
}

export type Bounds = {
  start: CodeLocation,
  end: CodeLocation,
};

export function boundsEqual(a: Bounds, b: Bounds): boolean {
  return codeLocationsEqual(a.start, b.start) && codeLocationsEqual(a.end, b.end);
}

export type ASTNode = {
  loc?: Bounds,
};
