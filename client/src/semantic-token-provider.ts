import {
  DocumentSemanticTokensProvider,
  Position,
  ProviderResult,
  SemanticTokensBuilder,
  TextDocument,
  Range,
  SemanticTokensLegend,
  SemanticTokens,
} from 'vscode';

const tokenTypes = ['comment'];
const tokenModifiers: string[] = [];
export const legend = new SemanticTokensLegend(tokenTypes, tokenModifiers);

const provider: DocumentSemanticTokensProvider = {
  provideDocumentSemanticTokens(document: TextDocument): ProviderResult<SemanticTokens> {
    const tokensBuilder = new SemanticTokensBuilder(legend);

    let inLua = false;
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);

      // Look for tokens defining beginning/end of Lua code
      if (line.text == '__lua__') {
        inLua = true;
        continue;
      } else if (inLua &&
          (line.text === '__gfx__' || line.text === '__label__' || line.text === '__gff__' || line.text === '__map__')
      ) {
        inLua = false;
        continue;
      }

      // Skip providing more tokens if we're not in Lua
      if (!inLua) {
        continue;
      }

      // currently only support double-slash line comments
      const match = line.text.indexOf('//');
      if (match !== -1) {
        tokensBuilder.push(
          new Range(new Position(i, match), new Position(i, Number.MAX_SAFE_INTEGER)),
          'comment',
          [],
        );
      }
    }

    return tokensBuilder.build();
  },
};

export default provider;
