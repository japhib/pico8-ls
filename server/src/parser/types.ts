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
  return a && b && codeLocationsEqual(a.start, b.start) && codeLocationsEqual(a.end, b.end);
}

export function cloneBounds(bounds: Bounds): Bounds {
  return {
    start: {
      line: bounds.start.line,
      column: bounds.start.column,
      index: bounds.start.index,
    },
    end: {
      line: bounds.end.line,
      column: bounds.end.column,
      index: bounds.end.index,
    },
  };
}

export type ASTNode = {
  loc?: Bounds,
};
