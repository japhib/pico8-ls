import { TextDocument } from 'vscode-languageserver-textdocument';
import { Comment_ } from './expressions';

function findSpecialMarkers(lines: string[]): { luaStartLine?: number, gfxStartLine?: number } {
  let luaStartLine: number | undefined = undefined;
  let gfxStartLine: number | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '__lua__') {
      luaStartLine = i;
    } else if (line === '__gfx__') {
      gfxStartLine = i;
    }
  }
  return { luaStartLine, gfxStartLine };
}

function createFoldingRegion(name: string, startLine: number, endLine: number, tabNumber: number) {
  return {
    name: `${tabNumber}: ${name}`,
    startLine: startLine,
    endLine: endLine,
  };
}

function getRegionNameFromNextComment(sortedComments: Comment_[], currentIndex: number): string {
  // Assuming the next comment always exists and contains the name.
  // This assumption is based on the previous user instruction.
  const nextComment = sortedComments[currentIndex + 1];
  if (nextComment.raw === '-->8'){
    return 'tab';
  }
  return nextComment.value.trim() || 'tab';
}

export function getFoldingRegions(textDocument: TextDocument, comments: Comment_[]): { name: string, startLine: number, endLine: number }[] {
  const foldingRegions: { name: string, startLine: number, endLine: number }[] = [];
  const lines = textDocument.getText().split('\n');
  const sortedComments = comments.sort((a, b) => a.loc!.start.line - b.loc!.start.line);

  const { luaStartLine, gfxStartLine } = findSpecialMarkers(lines);

  let tabNumber = 0;
  let currentFoldingStartLine: number | undefined = undefined;
  let currentFoldingName: string | undefined = undefined;

  // Stack to handle nested #region comments
  const regionStack: { startLine: number; name: string; isDefaultName: boolean }[] = [];
  const regionStartRegex = /^#region\s*(.*)$/;
  const regionEndRegex = /^#endregion\s*(.*)$/;

  // Handle the initial region before the first '-->8' comment, if __lua__ exists.
  if (luaStartLine !== undefined) {
    const firstFoldingComment = sortedComments.find(comment =>
      comment.raw === '-->8' && comment.loc!.start.line - 1 > luaStartLine,
    );

    if (firstFoldingComment) {
      const regionStartLine = luaStartLine + 1;
      // The name for this initial region is taken from a comment on the first line of the region, if it exists.
      const commentOnFirstLine = sortedComments.find(c => c.loc!.start.line - 1 === regionStartLine);
      const regionName = commentOnFirstLine ? commentOnFirstLine.value.trim() : 'tab';

      foldingRegions.push(createFoldingRegion(regionName, regionStartLine, firstFoldingComment.loc!.start.line - 2, tabNumber++));
    }
  }

  // Iterate through comments to find '-->8' markers and create folding regions.
  for (let i = 0; i < sortedComments.length; i++) {
    const comment = sortedComments[i];
    const commentText = comment.value.trim();

    // Handle #region and #endregion markers
    const regionStartMatch = regionStartRegex.exec(commentText);
    if (regionStartMatch) {
      const label = regionStartMatch[1] ? regionStartMatch[1].trim() : '';
      const name = label || 'region';
      regionStack.push({ startLine: comment.loc!.start.line, name: name, isDefaultName: !label });
    } else {
      const regionEndMatch = regionEndRegex.exec(commentText);
      if (regionEndMatch) {
        if (regionStack.length > 0) {
          const startRegion = regionStack.pop()!;
          const endLabel = regionEndMatch[1] ? regionEndMatch[1].trim() : '';

          let finalName = startRegion.name;
          if (startRegion.isDefaultName && endLabel) {
            finalName = endLabel;
          }

          foldingRegions.push({
            name: finalName,
            startLine: startRegion.startLine - 1,
            endLine: comment.loc!.start.line - 1,
          });
        }
      }
    }

    if (comment.raw === '-->8') {
      if (currentFoldingStartLine !== undefined) {
        foldingRegions.push(createFoldingRegion(currentFoldingName!, currentFoldingStartLine, comment.loc!.start.line - 2, tabNumber++));
      }
      currentFoldingStartLine = comment.loc!.start.line;
      currentFoldingName = getRegionNameFromNextComment(sortedComments, i);
    }
  }

  // Handle the last folding region.
  if (currentFoldingStartLine !== undefined) {
    let endLine = textDocument.lineCount - 1;
    if (gfxStartLine !== undefined) {
      endLine = gfxStartLine;
    }
    foldingRegions.push(createFoldingRegion(currentFoldingName!, currentFoldingStartLine, endLine, tabNumber++));
  }

  // Close any remaining open #region markers at the end of the file
  while (regionStack.length > 0) {
    const startRegion = regionStack.pop()!;
    foldingRegions.push({
      name: startRegion.name,
      startLine: startRegion.startLine,
      endLine: textDocument.lineCount - 1, // Fold to the end of the file
    });
  }

  // Sort the folding regions for consistent output
  foldingRegions.sort((a, b) => {
    if (a.startLine !== b.startLine) {
      return a.startLine - b.startLine;
    }
    return a.endLine - b.endLine;
  });

  return foldingRegions;
}
