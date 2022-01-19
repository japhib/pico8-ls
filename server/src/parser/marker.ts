import { Token } from './tokens';
import { Bounds, Node_, Range_ } from './types';

export default class Marker {
  loc?: Bounds;
  range?: Range_;

  constructor(token: Token) {
    this.loc = {
      start: {
        line: token.line,
        column: token.range[0] - token.lineStart,
      },
      end: {
        line: 0,
        column: 0,
      },
    };
  }

  // Complete the location data stored in the `Marker` by adding the location
  // of the *previous token* as an end location.
  complete(previousToken: Token) {
    this.loc!.end.line = previousToken.lastLine || previousToken.line;
    this.loc!.end.column = previousToken.range[1] - (previousToken.lastLineStart || previousToken.lineStart);
  }

  bless(node: Node_) {
    const loc = this.loc!;
    node.loc = {
      start: {
        line: loc.start.line,
        column: loc.start.column,
      },
      end: {
        line: loc.end.line,
        column: loc.end.column,
      },
    };
  }
}