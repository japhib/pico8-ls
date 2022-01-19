import * as errors from './errors';
import { errMessages } from './errors';
import { Token } from './tokens';

export type Goto = {
  token: Token,
  maxDepth: number,
  target: string,
  localCounts: number[],
};

export type Label = {
  localCount: number,
  line: number,
};

export type Local = {
  name: string,
  token: Token,
};

export type FlowScope = {
  labels: {[key: string]: Label},
  locals: Local[],
  deferredGotos: Goto[],
  isLoop: boolean,
};

// Control flow tracking
// ---------------------
// A context object that validates loop breaks and `goto`-based control flow.

export class FlowContext {
  allowVararg: boolean;
  scopes: FlowScope[];
  pendingGotos: Goto[];

  constructor() {
    this.allowVararg = false;
    this.scopes = [];
    this.pendingGotos = [];
  }

  isInLoop(): boolean {
    let i = this.scopes.length;
    while (i --> 0) {
      if (this.scopes[i].isLoop)
        return true;
    }
    return false;
  }

  currentScope() {
    return this.scopes[this.scopes.length - 1];
  }

  pushScope(isLoop?: boolean) {
    const scope = {
      labels: {},
      locals: [],
      deferredGotos: [],
      isLoop: !!isLoop,
    };
    this.scopes.push(scope);
  }

  popScope() {
    for (let i = 0; i < this.pendingGotos.length; ++i) {
      const theGoto = this.pendingGotos[i];
      if (theGoto.maxDepth >= this.scopes.length)
        if (--theGoto.maxDepth <= 0)
          errors.raiseErrForToken(theGoto.token, errMessages.labelNotVisible, theGoto.target);
    }

    this.scopes.pop();
  }

  addGoto(target: string, token: Token) {
    const localCounts = [];

    for (let i = 0; i < this.scopes.length; ++i) {
      const scope = this.scopes[i];
      localCounts.push(scope.locals.length);
      if (Object.prototype.hasOwnProperty.call(scope.labels, target))
        return;
    }

    this.pendingGotos.push({
      maxDepth: this.scopes.length,
      target: target,
      token: token,
      localCounts: localCounts,
    });
  }

  addLabel(name: string, token: Token) {
    const scope = this.currentScope();

    if (Object.prototype.hasOwnProperty.call(scope.labels, name)) {
      errors.raiseErrForToken(token, errMessages.labelAlreadyDefined, name, scope.labels[name].line);
    } else {
      const newGotos = [];

      for (let i = 0; i < this.pendingGotos.length; ++i) {
        const theGoto = this.pendingGotos[i];

        if (theGoto.maxDepth >= this.scopes.length && theGoto.target === name) {
          if (theGoto.localCounts[this.scopes.length - 1] < scope.locals.length) {
            scope.deferredGotos.push(theGoto);
          }
          continue;
        }

        newGotos.push(theGoto);
      }

      this.pendingGotos = newGotos;
    }

    scope.labels[name] = {
      localCount: scope.locals.length,
      line: token.line,
    };
  }

  addLocal(name: string, token: Token) {
    this.currentScope().locals.push({
      name: name,
      token: token,
    });
  }

  raiseDeferredErrors() {
    const scope = this.currentScope();
    const bads = scope.deferredGotos;
    for (let i = 0; i < bads.length; ++i) {
      const theGoto = bads[i];
      errors.raiseErrForToken(
        theGoto.token,
        errMessages.gotoJumpInLocalScope,
        theGoto.target,
        scope.locals[theGoto.localCounts[this.scopes.length - 1]].name,
      );
    }
  }
}