import { Token } from './tokens';
import { Bounds, ASTNode } from './types';

export default class Marker {
  loc: Bounds;

  constructor(token: Token) {
    this.loc = token.bounds;
  }

  // Complete the location data stored in the `Marker` by adding the location
  // of the *previous token* as an end location.
  complete(previousToken: Token) {
    this.loc.end = previousToken.bounds.end;
  }

  bless(node: ASTNode) {
    node.loc = this.loc;
  }
}