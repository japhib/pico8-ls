import { TextDocument } from 'vscode-languageserver-textdocument';
import { Chunk } from './parser/statements';
import * as url from 'url';
import * as path from 'path';
import { ParseError } from './parser/errors';

export type ProjectDocument = { textDocument: TextDocument, chunk: Chunk, errors: ParseError[] };

export type ParsedDocumentsMap = Map<string, ProjectDocument>;

// Represents a whole "project" tree. Starts at one root .p8 file, and includes
// all the files that may be included by it.
export type Project = { root: ProjectDocumentNode };

// Returns a human readable string listing all the files included in the project.
export function projectToString(project: Project): string {
  return getProjectFiles(project).map(f => path.basename(url.fileURLToPath(f))).join(', ');
}

export function getProjectFiles(project: Project) {
  const allFiles: string[] = [];

  iterateProject(project, node => allFiles.push(node.document.textDocument.uri));

  return allFiles;
}

export function iterateProject(project: Project, fun: (arg0: ProjectDocumentNode) => void) {
  const iterate = (node: ProjectDocumentNode) => {
    fun(node);
    for (const child of node.included) {
      iterate(child);
    }
  };
  iterate(project.root);
}

// A single node of the project tree, representing a single document and any
// files it directly includes.
export type ProjectDocumentNode = {
	document: ProjectDocument,
	included: ProjectDocumentNode[],
  // Whether this node is a child of any projects.
  isChild: boolean,
};

export function findProjects(parsedDocuments: ParsedDocumentsMap): Project[] {
  const visited = new Map<string, ProjectDocumentNode>();

  // Group all the files into projects
  for (const documentUrl of parsedDocuments.keys()) {
    findProjectsRecursive(documentUrl, visited, parsedDocuments);
  }

  // Now return all the non-child nodes as project roots
  return Array.from(visited.values())
    .filter(node => !node.isChild)
    .map(node => {
      return { root: node };
    });
}

function findProjectsRecursive(current: string, visited: Map<string, ProjectDocumentNode>, parsedDocuments: ParsedDocumentsMap): ProjectDocumentNode | undefined {
  if (visited.has(current)) {
    return;
  }

  const doc = parsedDocuments.get(current);
  if (!doc) {
    return;
  }

  const node: ProjectDocumentNode = {
    document: doc,
    included: [],
    isChild: false,
  };
  visited.set(current, node);

  // Loop through all files included by this file and add them as child nodes to this one
  const includes = doc.chunk.includes!;
  for (const include of includes) {
    const includedFileUrl = include.resolvedFile.fileURL;

    // Get project node corresponding to the included file. First check if the
    // node object already exists.
    let childNode = visited.get(includedFileUrl);
    if (!childNode) {
      // It doesn't exist yet, so let's recurse into it.
      childNode = findProjectsRecursive(includedFileUrl, visited, parsedDocuments);
    }

    if (childNode) {
      // Mark as child and insert into this node's children
      childNode.isChild = true;
      node.included.push(childNode);
    }
  }
  return node;
}

// We also need a map that maps from the file to the project it is a part of.

// Use cases:
//
// 1. When parsing or re-parsing a file, the global scope from the root should be injected into everything downstream.
//    So each file needs access to the root of the project, so it can use that for finding defs/usages.
//
// 2. When a file is edited and it's re-parsed, we need to examine its includes to see if the project structure has changed.
//    If it's changed, for now I guess we just call findProjects on _every single file_ again to rebuild the project trees.
//    So, each file needs access to what its includes _used_ to be, so we can tell if we need to rebuild project trees.
//    We also need to save the ParsedDocumentsMap in the server so that we can pass that into here, without re-parsing unchanged files.
