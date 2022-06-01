import ResolvedFile from './file-resolver';
import * as path from 'path';

export type CodeLocation = {
  line: number,
  column: number,
  index: number,
  filename: ResolvedFile,
};

export function codeLocationsEqual(a: CodeLocation, b: CodeLocation): boolean {
  return a.line === b.line && a.column === b.column && a.index === b.index && a.filename.equals(b.filename);
}

export function codeLocationToString(cl: CodeLocation) {
  return `${path.basename(cl.filename.path)} ${cl.line}:${cl.column}`;
}

export type Bounds = {
  start: CodeLocation,
  end: CodeLocation,
};

export function boundsEqual(a: Bounds, b: Bounds): boolean {
  return a && b && codeLocationsEqual(a.start, b.start) && codeLocationsEqual(a.end, b.end);
}

export function boundsToString(bounds: Bounds): string {
  if (!bounds.start.filename.equals(bounds.end.filename)) {
    return `${codeLocationToString(bounds.start)} to ${codeLocationToString(bounds.end)}`;
  }

  const filenameStr = path.basename(bounds.start.filename.path);

  if (bounds.start.line !== bounds.end.line) {
    return `${filenameStr} ${bounds.start.line}:${bounds.start.column} to ${bounds.end.line}:${bounds.end.column}`;
  }

  return `${filenameStr} ${bounds.start.line}:${bounds.start.column}-${bounds.end.column}`;
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
