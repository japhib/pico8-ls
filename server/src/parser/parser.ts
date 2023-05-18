import AST from './ast';
import { FlowContext } from './control-flow';
import * as errors from './errors';
import { errMessages, raiseErrForToken } from './errors';
import {
  CallExpression,
  Expression,
  Identifier,
  Literal,
  MemberExpression,
  StringCallExpression,
  StringLiteral,
  TableCallExpression,
  TableConstructorExpression,
  VarargLiteral,
  Variable,
} from './expressions';
import ResolvedFile, { FileResolver, RealFileResolver, resolveIncludeFile } from './file-resolver';
import Lexer from './lexer';
import Marker from './marker';
import {
  AssignmentStatement,
  Block,
  BreakStatement,
  CallStatement,
  Chunk,
  DoStatement,
  ForGenericStatement,
  ForNumericStatement,
  FunctionDeclaration,
  GeneralIfClause,
  GotoStatement,
  IfStatement,
  Include,
  IncludeStatement,
  LabelStatement,
  LocalStatement,
  RepeatStatement,
  ReturnStatement,
  Statement,
  WhileStatement,
} from './statements';
import { findSymbols } from './symbols';
import { Token, TokenType } from './tokens';
import { indexOfObject } from './util';
import * as path from 'path';
import { ASTNode } from './types';
import Operators from './operators';

export type Scope = string[];

export type ParserOptions = {
  dontAddGlobalSymbols?: boolean,
  includeFileResolver?: FileResolver,
};

export default class Parser {
  includeFileResolver: FileResolver;

  // A stack of lexers representing the file and any '#include'ed files we're
  // currently working with.
  //
  // The lexer at position 0 (bottom of the stack) is the lexer for the "main"
  // file that we're working with.
  lexerStack: {
    lexer: Lexer,
    // The IncludeStatement #including the file that prompted the creation of
    // this lexer.
    includeStatement: IncludeStatement | null,
  }[];

  // Locations are stored in a stack as a `Marker` object consisting of both
  // `loc` and `range` data. Once a `Marker` is popped off the stack an end
  // location is pushed and the data is attached to a syntax node.
  locations: Marker[] = [];

  // Store each block scope as a an array of identifier names. Each scope is
  // stored in a stack.
  scopes: Scope[] = [[]];
  // The current scope index
  scopeDepth = 0;
  // A list of all global identifier nodes.
  globals: Identifier[] = [];

  // Keep track of all errors that occurred while parsing.
  errors: errors.ParseError[] = [];

  // Flag for telling DefinitionsUsagesFinder not to add global PICO-8
  // predefined functions. Used for testing, just to make output a bit clearer.
  dontAddGlobalSymbols: boolean;

  includes: Include[] = [];

  // eslint-disable-next-line @typescript-eslint/ban-types
  constructor(filename: ResolvedFile, input: string, options: ParserOptions = {}) {
    this.includeFileResolver = options?.includeFileResolver || new RealFileResolver();
    this.dontAddGlobalSymbols = !!options?.dontAddGlobalSymbols;

    this.lexerStack = [{
      lexer: new Lexer(input, filename),
      includeStatement: null,
    }];
  }

  isInIncludedFile(): boolean {
    return this.lexerStack.length > 1;
  }

  // Returns the top lexer on the stack
  get lexer(): Lexer {
    return this.lexerStack[this.lexerStack.length - 1].lexer;
  }

  // Returns the filename of the current lexer
  get filename(): ResolvedFile {
    return this.lexer.filename;
  }

  get token(): Token {
    return this.lexer.token!;
  }

  get previousToken(): Token {
    return this.lexer.previousToken!;
  }

  lexerNext(): void {
    this.lexer.next();

    if (isEndOfFile(this.token) && this.isInIncludedFile()) {
      this.lexerStack.pop();
    }
  }

  parse(): Chunk {
    return this.parseChunk();
  }

  // Utility functions
  // -----------------

  // Wrap up the node object.
  finishNode<T extends ASTNode>(node: T, greedy?: boolean): T {
    // Pop a `Marker` off the location-array and attach its location data.
    const location = this.popLocation();

    // For "greedy" nodes we take the next token, instead of the previous one
    // (this is just block nodes atm)
    let endingToken = greedy ? this.token : this.previousToken;
    if (greedy && !endingToken) {
      // If there's no next token, take the previous one instead
      endingToken = this.previousToken;
    }

    if (location && endingToken) {
      location.complete(endingToken.bounds.end);
      location.bless(node as any as ASTNode);
    }

    node.included = this.isInIncludedFile();

    return node;
  }

  getUnexpectedTokenErr(found: Token): errors.ParseError {
    const near = this.lexer.lookahead!.value;

    let type;
    switch (found.type) {
    case TokenType.StringLiteral:   type = 'string';      break;
    case TokenType.Keyword:         type = 'keyword';     break;
    case TokenType.Identifier:      type = 'identifier';  break;
    case TokenType.NumericLiteral:  type = 'number';      break;
    case TokenType.Punctuator:      type = 'symbol';      break;
    case TokenType.BooleanLiteral:  type = 'boolean';     break;
    case TokenType.Newline:         type = 'newline';     break;
    case TokenType.NilLiteral:
      return errors.createErrForToken(found, errMessages.unexpected, 'symbol', 'nil', near);
    case TokenType.EOF:
      return errors.createErrForToken(found, errMessages.unexpectedEOF);
    }

    return errors.createErrForToken(found, errMessages.unexpected, type, found.value, near);
  }

  unexpectedToken(found: Token): never {
    throw this.getUnexpectedTokenErr(found);
  }

  // Location tracking
  // -----------------

  createLocationMarker(): Marker {
    return new Marker(this.token);
  }

  // Create a new `Marker` and add it to the FILO-array.
  markLocation() {
    this.locations.push(this.createLocationMarker());
  }

  // Push an arbitrary `Marker` object onto the FILO-array.
  pushLocation(marker: Marker) {
    // If we're using pushLocation rather than markLocation, there's a good
    // chance a marker is being re-used. In that case it's useful to clone the
    // marker to make sure we're not mutating a location that's already in the
    // AST.
    this.locations.push(marker.clone());
  }

  popLocation() {
    return this.locations.pop();
  }

  // Scope
  // -----

  // Create a new scope inheriting all declarations from the previous scope.
  createScope() {
    // copy current scope
    const scope = this.scopes[this.scopeDepth].slice();
    this.scopeDepth++;
    this.scopes.push(scope);
  }

  // Exit and remove the current scope.
  destroyScope() {
    --this.scopeDepth;
  }

  // Add identifier name to the current scope if it doesn't already exist.
  scopeIdentifierName(name: string) {
    if (-1 !== this.scopes[this.scopeDepth].indexOf(name)) {
      return;
    }
    this.scopes[this.scopeDepth].push(name);
  }

  // Add identifier to the current scope
  scopeIdentifier(node: Identifier) {
    this.scopeIdentifierName(node.name);
    this.attachScope(node, true);
  }

  // Attach scope information to node. If the node is global, store it in the
  // globals array so we can return the information to the user.
  attachScope(node: Identifier, isLocal: boolean) {
    if (!isLocal && -1 === indexOfObject(this.globals, 'name', node.name)) {
      this.globals.push(node);
    }

    node.isLocal = isLocal;
  }

  // Is the identifier name available in this scope.
  scopeHasName(name: string) {
    return (this.scopes[this.scopeDepth].indexOf(name) !== -1);
  }

  // Parse functions
  // ---------------

  // Chunk is the main program object. Syntactically it's the same as a block.
  //
  //     chunk ::= block

  parseChunk(): Chunk {
    this.lexerNext();
    this.markLocation();
    this.createScope();
    const flowContext = new FlowContext();
    flowContext.allowVararg = true;
    flowContext.pushScope();
    const body = this.parseBlock(flowContext, true);
    flowContext.popScope();
    this.destroyScope();

    if (this.token.type !== TokenType.EOF) {
      this.errors.push(this.getUnexpectedTokenErr(this.token));
    }

    const chunk = this.finishNode(AST.chunk(body, this.errors));
    chunk.includes = this.includes;
    chunk.comments = this.lexer.comments;

    chunk.symbols = findSymbols(chunk);

    return chunk;
  }

  // A block contains a list of statements with an optional return statement
  // as its last statement.
  //
  //     block ::= {stat} [retstat]

  parseBlock(flowContext: FlowContext, endsWithEOF?: boolean): Block {
    this.pushLocation(this.createLocationMarker());

    const block: Statement[] = [];
    const endingFunction = endsWithEOF ? isEndOfFile : isBlockFollow;

    while (!endingFunction(this.token)) {
      try {
        const statement = this.parseStatement(flowContext);

        if (statement?.type === 'IncludeStatement') {
          // Include statement - Load the included file and push a new lexer on
          // top of the stack to lex it.
          const resolvedInclude = resolveIncludeFile(this.filename, statement.filename);

          // Check for circular dependencies
          if (this.lexerStack.some(l => l.lexer.filename.equals(resolvedInclude))) {
            this.errors.push(this.getIncludeStatementError(statement, 'Circular #includes detected!'));
          } else {
            // Push include statement on there
            block.push(statement);

            // Load the file
            this.includeFile(statement, resolvedInclude);
          }
        } else {
          // optional semicolon ending the statement
          this.lexer.consume(';');

          // Statements are only added if they are returned, this allows us to
          // ignore some statements, such as EmptyStatement.
          if (statement) {
            block.push(statement);
          }
        }
      } catch (e) {
        if (errors.isParseError(e)) {
          // Caught a parse error. Add it to errors and synchronize.
          this.errors.push(e);

          // Discard tokens until we get to the end of the line or end of the block
          this.lexer.newlineSignificant = true;
          while (this.token.type !== TokenType.Newline && !endingFunction(this.token)) {
            this.lexerNext();
          }

          this.lexer.newlineSignificant = false;

          if (this.token.type === TokenType.Newline) {
            // If we got to a newline, consume the newline token and continue parsing.
            this.lexerNext();
          } else if (isEndOfFile(this.token) && this.isInIncludedFile()) {
            this.lexerStack.pop();
          } else {
          // Otherwise we got to the end of the block so we should stop.
            break;
          }

        } else {
          // whoops, it was some other error, shouldn't have caught it
          throw e;
        }
      }

      if (isEndOfFile(this.token) && this.isInIncludedFile()) {
        this.lexerStack.pop();
      }
    }

    return this.finishNode(AST.block(block), true);
  }

  includeFile(statement: IncludeStatement, resolvedInclude: ResolvedFile) {
    if (!this.includeFileResolver.doesFileExist(resolvedInclude.path)) {
      this.errors.push(this.getIncludeStatementError(statement, 'File does not exist'));
      return;
    }

    if (!this.includeFileResolver.isFile(resolvedInclude.path)) {
      this.errors.push(this.getIncludeStatementError(statement, 'File cannot be read (is it a directory?)'));
      return;
    }

    if (!this.isInIncludedFile()) {
      this.includes.push({ stmt: statement, resolvedFile: resolvedInclude });
    }

    const fileContents = this.includeFileResolver.loadFileContents(resolvedInclude.path);
    const newLexer = new Lexer(fileContents, resolvedInclude);
    newLexer.next();

    this.lexerStack.push({
      lexer: newLexer,
      includeStatement: statement,
    });
  }

  // There are two types of statements, simple and compound.
  //
  //     statement ::= break | goto | do | while | repeat | return
  //          | if | for | | local | label | assignment
  //          | functioncall | ';'

  parseStatement(flowContext: FlowContext): Statement | null {
    this.markLocation();

    if (this.token.type === TokenType.Punctuator) {
      if (this.lexer.consume('::')) {
        return this.parseLabelStatement(flowContext);
      }
    }

    // When a `;` is encounted, simply eat it without storing it.
    if (this.lexer.consume(';')) {
      this.popLocation();
      return null;
    }

    flowContext.raiseDeferredErrors();

    if (this.token.type === TokenType.Keyword) {
      switch (this.token.value) {
      case 'local':    this.lexerNext(); return this.parseLocalStatement(flowContext);
      case 'if':       this.lexerNext(); return this.parseIfStatement(flowContext);
      case 'return':   this.lexerNext(); return this.parseReturnStatement(flowContext);
      case 'function': this.lexerNext();
        const name = this.parseFunctionName();
        return this.parseFunctionDeclaration(name, false);
      case 'while':    this.lexerNext(); return this.parseWhileStatement(flowContext);
      case 'for':      this.lexerNext(); return this.parseForStatement(flowContext);
      case 'repeat':   this.lexerNext(); return this.parseRepeatStatement(flowContext);
      case 'break':    this.lexerNext();
        if (!flowContext.isInLoop()) {
          raiseErrForToken(this.token, errMessages.noLoopToBreak, this.token.value);
        }
        return this.parseBreakStatement();
      case 'do':       this.lexerNext(); return this.parseDoStatement(flowContext);
      case 'goto':     this.lexerNext(); return this.parseGotoStatement(flowContext);
      }
    }

    if (this.token.type === TokenType.Punctuator) {
      switch (this.token.value) {
      // special ? print function
      case '?':
        this.lexerNext();
        return this.parseSpecialPrint(flowContext);

        // #include filename.lua
      case '#':
        const currTokenIdx = this.token.bounds.start.index;
        this.lexer.consumeRestOfLine(currTokenIdx);
        return this.parseIncludeStatement();
      }
    }

    // Assignments memorizes the location and pushes it manually for wrapper nodes.
    this.popLocation();

    return this.parseAssignmentOrCallStatement(flowContext);
  }

  // ## Statements

  //     label ::= '::' Name '::'

  parseLabelStatement(flowContext: FlowContext): LabelStatement {
    const nameToken = this.token;
    const label = this.parseIdentifier();

    this.scopeIdentifierName('::' + nameToken.value + '::');
    this.attachScope(label, true);

    this.lexer.expect('::');

    flowContext.addLabel(nameToken.value as string, nameToken);
    return this.finishNode(AST.labelStatement(label));
  }

  //     break ::= 'break'

  parseBreakStatement(): BreakStatement {
    this.lexer.consume(';');
    return this.finishNode(AST.breakStatement());
  }

  //     goto ::= 'goto' Name

  parseGotoStatement(flowContext: FlowContext): GotoStatement {
    const name = this.token.value as string;
    const gotoToken = this.previousToken;
    const label = this.parseIdentifier();

    flowContext.addGoto(name, gotoToken);
    return this.finishNode(AST.gotoStatement(label));
  }

  //     do ::= 'do' block 'end'

  parseDoStatement(flowContext: FlowContext): DoStatement {
    this.createScope();
    flowContext.pushScope();
    const body = this.parseBlock(flowContext);
    flowContext.popScope();
    this.destroyScope();
    this.lexer.expect('end');
    return this.finishNode(AST.doStatement(body));
  }

  //     while ::= 'while' exp 'do' block 'end'

  parseWhileStatement(flowContext: FlowContext): WhileStatement {
    const condition = this.parseExpectedExpression(flowContext);
    this.lexer.expect('do');
    this.createScope();
    flowContext.pushScope(true);
    const body = this.parseBlock(flowContext);
    flowContext.popScope();
    this.destroyScope();
    this.lexer.expect('end');
    return this.finishNode(AST.whileStatement(condition, body));
  }

  //     repeat ::= 'repeat' block 'until' exp

  parseRepeatStatement(flowContext: FlowContext): RepeatStatement {
    this.createScope();
    flowContext.pushScope(true);
    const body = this.parseBlock(flowContext);
    this.lexer.expect('until');
    flowContext.raiseDeferredErrors();
    const condition = this.parseExpectedExpression(flowContext);
    flowContext.popScope();
    this.destroyScope();
    return this.finishNode(AST.repeatStatement(condition, body));
  }

  //     retstat ::= 'return' [exp {',' exp}] [';']

  parseReturnStatement(flowContext: FlowContext): ReturnStatement {
    const expressions = [];

    if ('end' !== this.token.value) {
      let expression = this.parseExpression(flowContext);
      if (null != expression) {
        expressions.push(expression);
      }
      while (this.lexer.consume(',')) {
        expression = this.parseExpectedExpression(flowContext);
        expressions.push(expression);
      }
      this.lexer.consume(';'); // grammar tells us ; is optional here.
    }
    return this.finishNode(AST.returnStatement(expressions));
  }

  //     if ::= 'if' exp 'then' block {elif} ['else' block] 'end'
  //     elif ::= 'elseif' exp 'then' block
  //
  // PICO-8 one-line if statement:
  //     if ::= 'if' '(' exp ')' statement ['else' statement] '\n'

  parseIfStatement(flowContext: FlowContext): IfStatement {
    const clauses: GeneralIfClause[] = [];
    let condition: Expression;
    let body;

    // IfClauses begin at the same location as the parent IfStatement.
    // It ends at the start of `end`, `else`, or `elseif`.
    let marker = this.locations[this.locations.length - 1];
    this.pushLocation(marker);

    const canBeOneLiner = this.lexer.token?.value === '(';

    condition = this.parseExpectedExpression(flowContext);

    if (!this.lexer.consume('then')) {
      if (canBeOneLiner) {
        // Handle special PICO-8 one-line if statement
        this.lexer.withSignificantNewline((cancelSignificantNewline) => {
          // pseudo-block for the if statement contents
          marker = this.createLocationMarker();
          this.pushLocation(marker);
          this.createScope();
          flowContext.pushScope();

          const statement = this.parseStatement(flowContext);
          if (!statement) {
            errors.raiseUnexpectedToken('statement', this.token);
          }

          flowContext.popScope();
          this.destroyScope();
          clauses.push(this.finishNode(AST.ifClause(condition, this.finishNode(AST.block([ statement ]), true))));

          if (this.lexer.consume('else')) {
            let multilineElse = false;
            if (this.lexer.consumeTokenType(TokenType.Newline)) {
              // Weird escape hatch here into multi-line `else` block.
              // Example:
              //
              //   if(v.x<-130) del(b,v) else
              //     v.x-=2
              //   end
              cancelSignificantNewline();
              multilineElse = true;
            }

            marker = this.createLocationMarker();
            this.pushLocation(marker);
            this.createScope();
            flowContext.pushScope();

            let elseBlock: Block;
            if (multilineElse) {
              // For a multi-line `else`, it can contain multiple statements and
              // ends with an `end` so just parse it like a regular block.
              elseBlock = this.parseBlock(flowContext);
              this.lexer.expect('end');
            } else {
              // Otherwise, can only be a single statement.
              const elseStatement = this.parseStatement(flowContext);
              if (!elseStatement) {
                errors.raiseUnexpectedToken('statement', this.token);
              }
              // Stick it in a block
              elseBlock = AST.block([ statement ]), true;
            }

            flowContext.popScope();
            this.destroyScope();
            clauses.push(this.finishNode(AST.elseClause(this.finishNode(elseBlock))));
          }
        });

        return this.finishNode(AST.ifStatement(clauses, true));
      } else {
        errors.raiseUnexpectedToken('statement', this.token);
      }
    }

    this.createScope();
    flowContext.pushScope();
    body = this.parseBlock(flowContext);
    flowContext.popScope();
    this.destroyScope();
    clauses.push(this.finishNode(AST.ifClause(condition, body), true));
    marker = this.createLocationMarker();

    while (this.lexer.consume('elseif')) {
      this.pushLocation(marker);
      condition = this.parseExpectedExpression(flowContext);
      this.lexer.expect('then');
      this.createScope();
      flowContext.pushScope();
      body = this.parseBlock(flowContext);
      flowContext.popScope();
      this.destroyScope();
      clauses.push(this.finishNode(AST.elseifClause(condition, body), true));
      marker = this.createLocationMarker();
    }

    if (this.lexer.consume('else')) {
      // Include the `else` in the location of ElseClause.
      marker = new Marker(this.previousToken);
      this.pushLocation(marker);
      this.createScope();
      flowContext.pushScope();
      body = this.parseBlock(flowContext);
      flowContext.popScope();
      this.destroyScope();
      clauses.push(this.finishNode(AST.elseClause(body), true));
    }

    this.lexer.expect('end');
    return this.finishNode(AST.ifStatement(clauses, false));
  }

  // There are two types of for statements, generic and numeric.
  //
  //     for ::= Name '=' exp ',' exp [',' exp] 'do' block 'end'
  //     for ::= namelist 'in' explist 'do' block 'end'
  //     namelist ::= Name {',' Name}
  //     explist ::= exp {',' exp}

  parseForStatement(flowContext: FlowContext): ForGenericStatement | ForNumericStatement {
    let variable = this.parseIdentifier();
    let body;

    this.createScope();
    this.scopeIdentifier(variable);

    // If the first expression is followed by a `=` punctuator, this is a
    // Numeric For Statement.
    if (this.lexer.consume('=')) {
      // Start expression
      const start = this.parseExpectedExpression(flowContext);
      this.lexer.expect(',');
      // End expression
      const end = this.parseExpectedExpression(flowContext);
      // Optional step expression
      const step = this.lexer.consume(',') ? this.parseExpectedExpression(flowContext) : null;

      this.lexer.expect('do');
      flowContext.pushScope(true);
      body = this.parseBlock(flowContext);
      flowContext.popScope();
      this.lexer.expect('end');
      this.destroyScope();

      return this.finishNode(AST.forNumericStatement(variable, start, end, step, body));
    // If not, it's a Generic For Statement
    } else {
      // The namelist can contain one or more identifiers.
      const variables = [ variable ];
      while (this.lexer.consume(',')) {
        variable = this.parseIdentifier();
        // Each variable in the namelist is locally scoped.
        this.scopeIdentifier(variable);
        variables.push(variable);
      }
      this.lexer.expect('in');
      const iterators: Expression[] = [];

      // One or more expressions in the explist.
      do {
        const expression = this.parseExpectedExpression(flowContext);
        iterators.push(expression);
      } while (this.lexer.consume(','));

      this.lexer.expect('do');
      flowContext.pushScope(true);
      body = this.parseBlock(flowContext);
      flowContext.popScope();
      this.lexer.expect('end');
      this.destroyScope();

      return this.finishNode(AST.forGenericStatement(variables, iterators, body));
    }
  }

  // Local statements can either be variable assignments or function
  // definitions. If a definition is found, it will be delegated to
  // `parseFunctionDeclaration()` with the isLocal flag.
  //
  // This AST structure might change into a local assignment with a function
  // child.
  //
  //     local ::= 'local' 'function' Name funcdecl
  //        | 'local' Name {',' Name} ['=' exp {',' exp}]

  parseLocalStatement(flowContext: FlowContext): LocalStatement | FunctionDeclaration {
    let name: Identifier;
    const declToken = this.previousToken;

    if (this.token.type === TokenType.Identifier) {
      const variables = [],
        init = [];

      do {
        name = this.parseIdentifier();

        variables.push(name);
        flowContext.addLocal(name.name, declToken);
      } while (this.lexer.consume(','));

      let operator: string | undefined = undefined;
      if (isAssignmentOperator(this.token)) {
        operator = this.token.value as string;
        this.lexerNext();

        do {
          const expression = this.parseExpectedExpression(flowContext);
          init.push(expression);
        } while (this.lexer.consume(','));
      }

      // Declarations doesn't exist before the statement has been evaluated.
      // Therefore assignments can't use their declarator. And the identifiers
      // shouldn't be added to the scope until the statement is complete.
      {
        for (let i = 0, l = variables.length; i < l; ++i) {
          this.scopeIdentifier(variables[i]);
        }
      }

      return this.finishNode(AST.localStatement(variables, operator, init));
    }
    if (this.lexer.consume('function')) {
      name = this.parseIdentifier();
      flowContext.addLocal(name.name, declToken);

      {
        this.scopeIdentifier(name);
        this.createScope();
      }

      // MemberExpressions are not allowed in local statements.
      return this.parseFunctionDeclaration(name, true);
    } else {
      errors.raiseUnexpectedToken('<name>', this.token);
    }
  }

  //     assignment ::= letlist '=' explist
  //     let ::= Name | prefixexp '[' exp ']' | prefixexp '.' Name
  //     letlist ::= let {',' let}
  //     explist ::= exp {',' exp}
  //
  //     call ::= callexp
  //     callexp ::= prefixexp args | prefixexp ':' Name args

  parseAssignmentOrCallStatement(flowContext: FlowContext): AssignmentStatement | CallStatement {
    // Keep a reference to the previous this.token for better error messages in case
    // of invalid statement
    let marker: Marker;
    let lvalue, base, name;

    const targets = [];

    const startMarker = this.createLocationMarker();

    do {
      marker = this.createLocationMarker();

      if (this.token.type === TokenType.Identifier) {
        name = this.token.value;
        base = this.parseIdentifier();
        // Set the parent scope.
        this.attachScope(base, this.scopeHasName(name as string));
        lvalue = true;
      } else if ('(' === this.token.value) {
        this.lexerNext();
        base = this.parseExpectedExpression(flowContext);
        this.lexer.expect(')');
        lvalue = false;
      } else {
        this.unexpectedToken(this.token);
      }

      both: while (true) {
        switch (this.token.type === TokenType.StringLiteral ? '"' : this.token.value) {
        case '.':
        case '[':
          lvalue = true;
          break;
        case ':':
        case '(':
        case '{':
        case '"':
          lvalue = null;
          break;
        default:
          break both;
        }

        base = this.parsePrefixExpressionPart(base as Identifier, marker, flowContext);
      }

      targets.push(base);

      if (',' !== this.token.value) {
        break;
      }

      if (!lvalue) {
        this.unexpectedToken(this.token);
      }

      this.lexerNext();
    } while (true);

    if (targets.length === 1 && lvalue === null) {
      this.pushLocation(marker);
      return this.finishNode(AST.callStatement(targets[0]));
    } else if (!lvalue) {
      this.unexpectedToken(this.token);
    }

    if (!isAssignmentOperator(this.token)) {
      errors.raiseUnexpectedToken('assignment operator', this.token);
    }
    const operator = this.token.value as string;
    this.lexerNext();

    const values = [];
    do {
      values.push(this.parseExpectedExpression(flowContext));
    }
    while (this.lexer.consume(','));

    this.pushLocation(startMarker);
    return this.finishNode(AST.assignmentStatement(targets as Variable[], operator, values));
  }

  // Special PICO-8 print statement: ? expression '\n'
  parseSpecialPrint(flowContext: FlowContext): CallStatement {
    const startMarker = this.createLocationMarker();

    const args: Expression[] = [];
    this.lexer.withSignificantNewline(() => {
      let expression = this.parseExpectedExpression(flowContext);
      args.push(expression);

      // look for more args
      while (this.token.type === TokenType.Punctuator && this.token.value === ',') {
        this.lexerNext();
        expression = this.parseExpectedExpression(flowContext);
        args.push(expression);
      }
    });

    // Each part uses the same start marker. One instance of it was already
    // pushed above. finishNode will consume the top location on the stack so we
    // have to push 2 more times.
    const base = this.finishNode(AST.identifier('?'));
    this.pushLocation(startMarker);
    const callExpression = this.finishNode(AST.callExpression(base, args));
    this.pushLocation(startMarker);
    return this.finishNode(AST.callStatement(callExpression));
  }

  // Special PICO-8 include statement: '#include' filename
  parseIncludeStatement(): IncludeStatement {
    const line = this.token.value as string;

    const includeRegexp = /#include\s+(.*)$/;
    const match = includeRegexp.exec(line);
    if (!match) {
      errors.raiseUnexpectedToken('#include <filename>', this.token);
    }

    // skip over the rest of the line for the next statement to be parsed
    this.lexerNext();

    return this.finishNode({
      type: 'IncludeStatement',
      filename: match[1],
    });
  }

  getIncludeStatementError(statement: IncludeStatement, errorMessage: string) {
    const baseIncludeStatement = this.lexerStack.length >= 2 ? this.lexerStack[1].includeStatement! : statement;

    const fromPath: string = this.lexerStack.reverse().map(l => path.basename(l.lexer.filename.path)).join(', which is #included from ');

    return new errors.ParseError(`Can't #include ${statement.filename} from ${fromPath}: ${errorMessage}`, baseIncludeStatement.loc!);
  }

  // ### Non-statements

  //     Identifier ::= Name

  parseIdentifier(): Identifier {
    this.markLocation();
    const identifier = this.token.value as string;
    if (this.token.type !== TokenType.Identifier) {
      errors.raiseUnexpectedToken('<name>', this.token);
    }
    this.lexerNext();
    return this.finishNode(AST.identifier(identifier));
  }

  // Parse the functions parameters and body block. The name should already
  // have been parsed and passed to this declaration function. By separating
  // this we allow for anonymous functions in expressions.
  //
  // For local functions there's a boolean parameter which needs to be set
  // when parsing the declaration.
  //
  //     funcdecl ::= '(' [parlist] ')' block 'end'
  //     parlist ::= Name {',' Name} | [',' '...'] | '...'

  parseFunctionDeclaration(name: Identifier | MemberExpression | null, isLocal: boolean): FunctionDeclaration {
    const flowContext = new FlowContext();
    flowContext.pushScope();

    const parameters = [];
    this.lexer.expect('(');

    // The declaration has arguments
    if (!this.lexer.consume(')')) {
      // Arguments are a comma separated list of identifiers, optionally ending
      // with a Vararg.
      do {
        if (this.token.type === TokenType.Identifier) {
          const parameter = this.parseIdentifier();
          // parameters are local.
          this.scopeIdentifier(parameter);
          parameters.push(parameter);
        } else if (this.token.type === TokenType.VarargLiteral) {
          flowContext.allowVararg = true;
          parameters.push(this.parsePrimaryExpression(flowContext) as VarargLiteral);
          // No arguments are allowed after a Vararg.
          break;
        } else {
          this.errors.push(errors.createErrForToken(this.token, errMessages.expectedToken, '<name> or \'...\'', this.token.value));

          // Discard tokens until we get a ')' or ','
          while (this.token.value !== ')' && this.token.value !== ',') {
            this.lexerNext();
          }

        }
      } while (this.lexer.consume(','));

      if (!this.lexer.consume(')')) {
        this.errors.push(errors.createErrForToken(this.token, errMessages.expected, ')', this.token.value));

        // Discard tokens until we get a ')'
        while (this.token.value !== ')') {
          this.lexerNext();
        }
        // consume the ')'
        this.lexerNext();
      }
    }

    const body = this.parseBlock(flowContext);
    flowContext.popScope();
    this.lexer.expect('end');
    this.destroyScope();

    isLocal = isLocal || false;
    return this.finishNode(AST.functionStatement(name, parameters, isLocal, body));
  }

  // Parse the name as identifiers and member expressions.
  //
  //     Name {'.' Name} [':' Name]

  parseFunctionName() {
    let base, name;

    const marker = this.createLocationMarker();
    base = this.parseIdentifier();

    this.attachScope(base, this.scopeHasName(base.name));
    this.createScope();

    while (this.lexer.consume('.')) {
      this.pushLocation(marker);
      name = this.parseIdentifier();
      base = this.finishNode(AST.memberExpression(base, '.', name));
    }

    if (this.lexer.consume(':')) {
      this.pushLocation(marker);
      name = this.parseIdentifier();
      base = this.finishNode(AST.memberExpression(base, ':', name));
      this.scopeIdentifierName('self');
    }

    return base;
  }

  //     tableconstructor ::= '{' [fieldlist] '}'
  //     fieldlist ::= field {fieldsep field} fieldsep
  //     field ::= '[' exp ']' '=' exp | Name = 'exp' | exp
  //
  //     fieldsep ::= ',' | ';'

  parseTableConstructor(flowContext: FlowContext): TableConstructorExpression {
    const fields = [];
    let key, value;

    while (true) {
      this.markLocation();
      if (this.token.type === TokenType.Punctuator && this.lexer.consume('[')) {
        key = this.parseExpectedExpression(flowContext);
        this.lexer.expect(']');
        this.lexer.expect('=');
        value = this.parseExpectedExpression(flowContext);
        fields.push(this.finishNode(AST.tableKey(key, value)));
      } else if (this.token.type === TokenType.Identifier) {
        if ('=' === this.lexer.lookahead!.value) {
          key = this.parseIdentifier();
          this.lexerNext();
          value = this.parseExpectedExpression(flowContext);
          fields.push(this.finishNode(AST.tableKeyString(key, value)));
        } else {
          value = this.parseExpectedExpression(flowContext);
          fields.push(this.finishNode(AST.tableValue(value)));
        }
      } else {
        if (null == (value = this.parseExpression(flowContext))) {
          this.popLocation();
          break;
        }
        fields.push(this.finishNode(AST.tableValue(value)));
      }
      if (',;'.indexOf(this.token.value as string) >= 0) {
        this.lexerNext();
        continue;
      }
      break;
    }
    this.lexer.expect('}');
    return this.finishNode(AST.tableConstructorExpression(fields));
  }

  // Expression parser
  // -----------------
  //
  // Expressions are evaluated and always return a value. If nothing is
  // matched null will be returned.
  //
  //     exp ::= (unop exp | primary | prefixexp ) { binop exp }
  //
  //     primary ::= nil | false | true | Number | String | '...'
  //          | functiondef | tableconstructor
  //
  //     prefixexp ::= (Name | '(' exp ')' ) { '[' exp ']'
  //          | '.' Name | ':' Name args | args }
  //

  parseExpression(flowContext: FlowContext): Expression | null {
    return this.parseSubExpression(0, flowContext);
  }

  // Parse an expression expecting it to be valid.

  parseExpectedExpression(flowContext: FlowContext): Expression {
    const expression = this.parseExpression(flowContext);
    if (null == expression) {
      errors.raiseUnexpectedToken('<expression>', this.token);
    } else {
      return expression;
    }
  }

  // Implement an operator-precedence parser to handle binary operator
  // precedence.
  //
  // We use this algorithm because it's compact, it's fast and Lua core uses
  // the same so we can be sure our expressions are parsed in the same manner
  // without excessive amounts of tests.
  //
  //     exp ::= (unop exp | primary | prefixexp ) { binop exp }

  parseSubExpression(minPrecedence: number, flowContext: FlowContext): Expression | null {
    let operator = this.token.value as string;
    // The left-hand side in binary operations.
    let expression: Expression | null = null;

    const marker = this.createLocationMarker();

    // UnaryExpression
    if (isUnary(this.token)) {
      this.markLocation();
      this.lexerNext();
      const argument = this.parseSubExpression(10, flowContext);
      if (argument == null) {
        errors.raiseUnexpectedToken('<expression>', this.token);
      }
      expression = this.finishNode(AST.unaryExpression(operator, argument));
    }

    if (null == expression) {
      // PrimaryExpression
      expression = this.parsePrimaryExpression(flowContext);

      // PrefixExpression
      if (null == expression) {
        expression = this.parsePrefixExpression(flowContext);
      }

    }
    // This is not a valid left hand expression.
    if (null == expression) {
      return null;
    }

    let precedence;
    while (true) {
      operator = this.token.value as string;

      precedence = (this.token.type === TokenType.Punctuator || this.token.type === TokenType.Keyword) ?
        Operators.binaryPrecedenceOf(operator) : Operators.minPrecedenceValue;

      if (precedence === Operators.minPrecedenceValue || precedence <= minPrecedence) {
        break;
      }
      // Right-hand precedence operators
      if ('^' === operator || '..' === operator) {
        --precedence;
      }
      this.lexerNext();
      const right = this.parseSubExpression(precedence, flowContext);
      if (null == right) {
        errors.raiseUnexpectedToken('<expression>', this.token);
      }
      // Push in the marker created before the loop to wrap its entirety.
      this.pushLocation(marker);
      expression = this.finishNode(AST.binaryExpression(operator, expression, right));
    }
    return expression;
  }

  //     prefixexp ::= prefix {suffix}
  //     prefix ::= Name | '(' exp ')'
  //     suffix ::= '[' exp ']' | '.' Name | ':' Name args | args
  //
  //     args ::= '(' [explist] ')' | tableconstructor | String

  parsePrefixExpressionPart(base: Expression, marker: Marker, flowContext: FlowContext) {
    let expression, identifier;

    if (this.token.type === TokenType.Punctuator) {
      switch (this.token.value) {
      case '[':
        this.pushLocation(marker);
        this.lexerNext();
        expression = this.parseExpectedExpression(flowContext);
        this.lexer.expect(']');
        return this.finishNode(AST.indexExpression(base, expression));
      case '.':
        this.pushLocation(marker);
        this.lexerNext();
        identifier = this.parseIdentifier();
        return this.finishNode(AST.memberExpression(base, '.', identifier));
      case ':':
        this.pushLocation(marker);
        this.lexerNext();
        identifier = this.parseIdentifier();
        base = this.finishNode(AST.memberExpression(base, ':', identifier));
        // Once a : is found, this has to be a CallExpression, otherwise
        // throw an error.
        this.pushLocation(marker);
        return this.parseCallExpression(base, flowContext);
      case '(': case '{': // args
        this.pushLocation(marker);
        return this.parseCallExpression(base, flowContext);
      }
    } else if (this.token.type === TokenType.StringLiteral) {
      this.pushLocation(marker);
      return this.parseCallExpression(base, flowContext);
    }

    return null;
  }

  parsePrefixExpression(flowContext: FlowContext) {
    let base, name;

    const marker = this.createLocationMarker();

    // The prefix
    if (TokenType.Identifier === this.token.type) {
      name = this.token.value as string;
      base = this.parseIdentifier();
      // Set the parent scope.
      this.attachScope(base, this.scopeHasName(name));
    } else if (this.lexer.consume('(')) {
      base = this.parseExpectedExpression(flowContext);
      this.lexer.expect(')');
    } else {
      return null;
    }

    // The suffix
    for (;;) {
      const newBase = this.parsePrefixExpressionPart(base, marker, flowContext);
      if (newBase === null) {
        break;
      }
      base = newBase;
    }

    return base;
  }

  //     args ::= '(' [explist] ')' | tableconstructor | String

  parseCallExpression(base: Expression, flowContext: FlowContext):
      CallExpression | TableCallExpression | StringCallExpression {
    if (TokenType.Punctuator === this.token.type) {
      switch (this.token.value) {
      case '(':
        this.lexerNext();

        // List of expressions
        const expressions = [];
        let expression = this.parseExpression(flowContext);
        if (null != expression) {
          expressions.push(expression);
        }
        while (this.lexer.consume(',')) {
          expression = this.parseExpectedExpression(flowContext);
          expressions.push(expression);
        }

        this.lexer.expect(')');
        return this.finishNode(AST.callExpression(base, expressions));

      case '{':
        this.markLocation();
        this.lexerNext();
        const table = this.parseTableConstructor(flowContext);
        return this.finishNode(AST.tableCallExpression(base, table));
      }
    } else if (TokenType.StringLiteral === this.token.type) {
      return this.finishNode(AST.stringCallExpression(base, this.parsePrimaryExpression(flowContext) as StringLiteral));
    }

    errors.raiseUnexpectedToken('arguments', this.token);
  }

  //     primary ::= String | Numeric | nil | true | false
  //          | functiondef | tableconstructor | '...'

  parsePrimaryExpression(flowContext: FlowContext): Literal | FunctionDeclaration | TableConstructorExpression | null {
    const literals = [ TokenType.StringLiteral, TokenType.NumericLiteral, TokenType.BooleanLiteral, TokenType.NilLiteral, TokenType.VarargLiteral ];
    const value = this.token.value;
    const type = this.token.type;

    const marker = this.createLocationMarker();

    if (type === TokenType.VarargLiteral && !flowContext.allowVararg) {
      raiseErrForToken(this.token, errMessages.cannotUseVararg, this.token.value);
    }

    if (literals.includes(type)) {
      this.pushLocation(marker);
      const raw = this.lexer.input.slice(this.token.bounds.start.index, this.token.bounds.end.index);
      this.lexerNext();
      return this.finishNode(AST.literal(type, value, raw));
    } else if (type === TokenType.Keyword && 'function' === value) {
      this.pushLocation(marker);
      this.lexerNext();
      this.createScope();
      return this.parseFunctionDeclaration(null, false);
    } else if (this.lexer.consume('{')) {
      this.pushLocation(marker);
      return this.parseTableConstructor(flowContext);
    }

    return null;
  }
}

function isUnary(token: Token): boolean {
  // PICO-8 uses @a (peek), %a (peek2), $a (peek4) as unary operators
  // (see: https://pico-8.fandom.com/wiki/Lua#Operator_priorities)
  // ~ is bitwise NOT
  if (token.type === TokenType.Punctuator) {
    return [ '#', '-', '~', '@', '%', '$' ].includes(token.value as string);
  }
  if (token.type === TokenType.Keyword) {
    return 'not' === token.value;
  }
  return false;
}

function isAssignmentOperator(token: Token): boolean {
  return token.type === TokenType.Punctuator &&
    [ '=', '+=', '-=', '*=', '/=', '\\=', '%=', '^=', '..=', '|=',
      '&=', '^^=', '<<=', '>>=', '>>>=', '<<>=', '>><=' ].includes(token.value as string);
}

// Check if the token syntactically closes a block.
function isBlockFollow(token: Token) {
  if (token.type === TokenType.EOF) {
    return true;
  }
  if (token.type !== TokenType.Keyword) {
    return false;
  }
  switch (token.value) {
  case 'else': case 'elseif':
  case 'end': case 'until':
    return true;
  default:
    return false;
  }
}

function isEndOfFile(token: Token) {
  return token.type === TokenType.EOF;
}
