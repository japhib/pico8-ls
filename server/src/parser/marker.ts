import { Token } from './tokens';
import { Bounds, ASTNode, boundsClone } from './types';

export default class Marker {
  loc: Bounds;

  constructor(tokenOrBounds: Token | Bounds) {
    if ((tokenOrBounds as Token).type) {
      this.loc = (tokenOrBounds as Token).bounds;
    } else {
      this.loc = (tokenOrBounds as Bounds);
    }
  }

  // Complete the location data stored in the `Marker` by adding the location
  // of the *previous token* as an end location.
  complete(previousToken: Token) {
    this.loc = boundsClone(this.loc);
    this.loc.end = previousToken.bounds.end;
  }

  bless(node: ASTNode) {
    node.loc = this.loc;
  }

  clone(): Marker {
    return new Marker(boundsClone(this.loc));
  }
}
