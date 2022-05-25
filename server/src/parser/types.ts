import ResolvedFile from './file-resolver';

export type CodeLocation = {
  line: number,
  column: number,
  index: number,
  filename: ResolvedFile,
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

export function boundsSize(b: Bounds): number {
  const lineSize = b.end.line - b.start.line;
  const columnSize = b.end.column - b.start.column;

  return columnSize + (10000 * lineSize);
}

export function boundsClone(bounds: Bounds): Bounds {
  return {
    start: {
      line: bounds.start.line,
      column: bounds.start.column,
      index: bounds.start.index,
      filename: bounds.start.filename,
    },
    end: {
      line: bounds.end.line,
      column: bounds.end.column,
      index: bounds.end.index,
      filename: bounds.end.filename,
    },
  };
}

export type ASTNode = {
  loc?: Bounds,
};
