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

  toString(): string {
    return `ResolvedFile(path=${this.path},fileURL=${this.fileURL})`;
  }
}

export function fileURLToPath(fileUrl: string): string {
  return url.fileURLToPath(fileUrl);
}

export function pathToFileURL(filePath: string): string {
  let uri = url.pathToFileURL(filePath).toString();

  const match = /^file:\/\/\/(\w):\/(.*)$/.exec(uri);
  if (match) {
    // For Windows URIs we need to urlencode the colon in "c:/" or whatever
    const driveLetter = match[1];
    const rest = match[2];
    uri = `file:///${driveLetter}%3A/${rest}`;
  }

  return uri;
}

export function resolveIncludeFile(currFile: ResolvedFile, includeFilename: string): ResolvedFile {
  const currFileDir = path.dirname(currFile.path);
  const resolvedPath = path.normalize(path.join(currFileDir, includeFilename));
  return ResolvedFile.fromPath(resolvedPath);
}

export interface FileResolver {
  doesFileExist: (filepath: string) => boolean;
  isFile: (filepath: string) => boolean;
  loadFileContents: (filepath: string) => string;
}

export class RealFileResolver implements FileResolver {
  doesFileExist(filepath: string): boolean {
    return fs.existsSync(filepath);
  }

  isFile(filepath: string): boolean {
    return fs.lstatSync(filepath).isFile();
  }

  loadFileContents(filepath: string): string {
    return fs.readFileSync(filepath).toString();
  }
}
