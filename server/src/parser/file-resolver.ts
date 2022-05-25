import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

export default class ResolvedFile {
  path: string;
  fileURL: string;

  constructor(path: string, fileURL: string) {
    this.path = path;
    this.fileURL = fileURL;
  }

  static fromFileURL(fileURL: string): ResolvedFile {
    return new ResolvedFile(
      fileURLToPath(fileURL),
      fileURL,
    );
  }

  static fromPath(path: string): ResolvedFile {
    return new ResolvedFile(
      path,
      pathToFileURL(path),
    );
  }

  equals(other: ResolvedFile): boolean {
    return this.path === other.path && this.fileURL === other.fileURL;
  }
}

export function fileURLToPath(fileUrl: string): string {
  return url.fileURLToPath(fileUrl);
}

export function pathToFileURL(path: string): string {
  return url.pathToFileURL(path).toString();
}

export function resolveIncludeFile(currFile: ResolvedFile, includeFilename: string): ResolvedFile {
  const currFileDir = path.dirname(currFile.path);
  const resolvedPath = path.normalize(path.join(currFileDir, includeFilename));
  return ResolvedFile.fromPath(resolvedPath);
}

export interface FileResolver {
  doesFileExist: (filepath: string) => boolean;
  loadFileContents: (filepath: string) => string;
}

export class RealFileResolver implements FileResolver {
  doesFileExist(filepath: string): boolean {
    return fs.existsSync(filepath);
  }

  loadFileContents(filepath: string): string {
    return fs.readFileSync(filepath).toString();
  }
}
