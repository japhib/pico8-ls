import { CodeSymbol } from './symbols';
import { Bounds } from './types';

// Class for looking up symbol information by document position.
export default class SymbolLocationLookup {
  symbolsByLine: SymbolsOnLine[] = [];

  addSymbol(bounds: Bounds, symbol: CodeSymbol) {
    const line = bounds.start.line;

    let symbolsOnLine = this.symbolsByLine[line];
    if (!symbolsOnLine) {
      symbolsOnLine = [];
      this.symbolsByLine[line] = symbolsOnLine;
    }

    symbolsOnLine.push(symbol);
  }

  getSymbol(line: number, column: number): CodeSymbol | undefined {
    const symbolsOnLine = this.symbolsByLine[line];
    if (!symbolsOnLine) return undefined;

    for (const symbol of symbolsOnLine) {
      if (column >= symbol.loc.start.column && column <= symbol.loc.end.column)
        return symbol;
    }

    // wasn't found.
    return undefined;
  }
}

type SymbolsOnLine = CodeSymbol[];
