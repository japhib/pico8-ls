import AST from './ast';
import { FlowContext } from './control-flow';
import { findDefinitionsUsages } from './definitions-usages';
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

export type Scope = string[];

export default class Parser {
  includeFileResolver: FileResolver;

  // A stack of lexers representing the file and any '#include'ed files we're
  // currently working with.
  //
  // The lexer at position 0 (bottom of the stack) is the lexer for the "main"
  // file that we're working with.
  lexerStack: Lexer[];

  // Locations are stored in a stack as a `Marker` object consisting of both
  // `loc` and `range` data. Once a `Marker` is popped off the stack an end
  // location is pushed and the data is attached to a syntax node.
  locations: Marker[] = [];

  // Store each block scope as a an array of identifier names. Each scope is
  // stored in an FILO-array.
  scopes: Scope[] = [ [] ];
  // The current scope index
  scopeDepth = 0;
  // A list of all global identifier nodes.
  globals: Identifier[] = [];

  // Keep track of all errors that occurred while parsing.
  errors: errors.ParseError[] = [];

  // Flag for telling DefinitionsUsagesFinder not to add global PICO-8
  // predefined functions. Used for testing, just to make output a bit clearer.
  dontAddGlobalSymbols: boolean;

  // eslint-disable-next-line @typescript-eslint/ban-types
  constructor(filename: ResolvedFile, input: string, includeFileResolver?: FileResolver, dontAddGlobalSymbols?: boolean) {
    this.includeFileResolver = includeFileResolver || new RealFileResolver();
    this.dontAddGlobalSymbols = !!dontAddGlobalSymbols;

    this.lexerStack = [ new Lexer(input, filename) ];
  }

  // Returns the top lexer on the stack
  get lexer(): Lexer {
    return this.lexerStack[this.lexerStack.length - 1];
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

  parse(): Chunk {
    return this.parseChunk();
  }

  // Utility functions
  // -----------------

  // Wrap up the node object.
  finishNode<T>(node: T): T {
    // Pop a `Marker` off the location-array and attach its location data.
    const location = this.popLocation();
    if (location && this.previousToken) {
      location.complete(this.previousToken);
      location.bless(node);
    }
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
    const scope = this.scopes[this.scopeDepth].slice();
    this.scopeDepth++;
    this.scopes.push(scope);
  }

  // Exit and remove the current scope.
  destroyScope() {
    --this.scopeDepth;
  }

  // Add identifier name to the current scope if it doesnt already exist.
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
    this.lexer.next();
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

    chunk.symbols = findSymbols(chunk);

    const { defUs, warnings, scopes } = findDefinitionsUsages(chunk, this.dontAddGlobalSymbols);
    chunk.definitionsUsages = defUs;
    chunk.warnings = warnings;
    chunk.scopes = scopes;

    return chunk;
  }

  // A block contains a list of statements with an optional return statement
  // as its last statement.
  //
  //     block ::= {stat} [retstat]

  parseBlock(flowContext: FlowContext, endsWithEOF?: boolean): Statement[] {
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
          if (this.lexerStack.some(l => l.filename.equals(resolvedInclude))) {
            this.errors.push(this.getIncludeStatementError(statement, 'Circular #includes detected!'));
          } else {
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
            this.lexer.next();
          }

          this.lexer.newlineSignificant = false;

          if (this.token.type === TokenType.Newline) {
            // If we got to a newline, consume the newline token and continue parsing.
            this.lexer.next();
          } else {
          // Otherwise we got to the end of the block so we should stop.
            break;
          }

        } else {
          // whoops, it was some other error, shouldn't have caught it
          throw e;
        }
      }

      if (isEndOfFile(this.token) && this.lexerStack.length > 1) {
        this.lexerStack.pop();
      }
    }

    // Doesn't really need an ast node
    return block;
  }

  includeFile(statement: IncludeStatement, resolvedInclude: ResolvedFile) {
    console.log(JSON.stringify(resolvedInclude));
    if (!this.includeFileResolver.doesFileExist(resolvedInclude.path)) {
      this.errors.push(this.getIncludeStatementError(statement, 'File does not exist'));
      return;
    }

    const fileContents = this.includeFileResolver.loadFileContents(resolvedInclude.path);
    console.log(fileContents);
    const newLexer = new Lexer(fileContents, resolvedInclude);
    newLexer.next();

    this.lexerStack.push(newLexer);
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
      case 'local':    this.lexer.next(); return this.parseLocalStatement(flowContext);
      case 'if':       this.lexer.next(); return this.parseIfStatement(flowContext);
      case 'return':   this.lexer.next(); return this.parseReturnStatement(flowContext);
      case 'function': this.lexer.next();
        const name = this.parseFunctionName();
        return this.parseFunctionDeclaration(name, false);
      case 'while':    this.lexer.next(); return this.parseWhileStatement(flowContext);
      case 'for':      this.lexer.next(); return this.parseForStatement(flowContext);
      case 'repeat':   this.lexer.next(); return this.parseRepeatStatement(flowContext);
      case 'break':    this.lexer.next();
        if (!flowContext.isInLoop()) {
          raiseErrForToken(this.token, errMessages.noLoopToBreak, this.token.value);
        }
        return this.parseBreakStatement();
      case 'do':       this.lexer.next(); return this.parseDoStatement(flowContext);
      case 'goto':     this.lexer.next(); return this.parseGotoStatement(flowContext);
      }
    }

    if (this.token.type === TokenType.Punctuator) {
      switch (this.token.value) {
      // special ? print function
      case '?':
        this.lexer.next();
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

        this.lexer.newlineSignificant = true;

        this.lexer.withSignificantNewline((() => {
          this.createScope();
          flowContext.pushScope();
          const statement = this.parseStatement(flowContext);
          if (!statement) {
            errors.raiseUnexpectedToken('statement', this.token);
          }

          flowContext.popScope();
          this.destroyScope();
          clauses.push(this.finishNode(AST.ifClause(condition, [ statement ])));

          if (this.lexer.consume('else')) {
            this.createScope();
            flowContext.pushScope();
            const elseStatement = this.parseStatement(flowContext);
            if (!elseStatement) {
              errors.raiseUnexpectedToken('statement', this.token);
            }

            flowContext.popScope();
            this.destroyScope();
            clauses.push(this.finishNode(AST.elseClause([ elseStatement ])));
          }
        }).bind(this));

        return this.finishNode(AST.ifStatement(clauses));
      } else {
        errors.raiseUnexpectedToken('statement', this.token);
      }
    }

    this.createScope();
    flowContext.pushScope();
    body = this.parseBlock(flowContext);
    flowContext.popScope();
    this.destroyScope();
    clauses.push(this.finishNode(AST.ifClause(condition, body)));

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
      clauses.push(this.finishNode(AST.elseifClause(condition, body)));
      marker = this.createLocationMarker();
    }

    if (this.lexer.consume('else')) {
      // Include the `else` in the location of ElseClause.
      {
        marker = new Marker(this.previousToken);
        this.pushLocation(marker);
      }
      this.createScope();
      flowContext.pushScope();
      body = this.parseBlock(flowContext);
      flowContext.popScope();
      this.destroyScope();
      clauses.push(this.finishNode(AST.elseClause(body)));
    }

    this.lexer.expect('end');
    return this.finishNode(AST.ifStatement(clauses));
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
        this.lexer.next();

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
        this.lexer.next();
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

      this.lexer.next();
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
    this.lexer.next();

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
    let expression: Expression;
    this.lexer.withSignificantNewline((() => {
      expression = this.parseExpectedExpression(flowContext);
    }).bind(this));

    const base = this.finishNode(AST.identifier('?'));
    const callExpression = this.finishNode(AST.callExpression(base, [ expression! ]));
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
    this.lexer.next();

    return this.finishNode({
      type: 'IncludeStatement',
      filename: match[1],
    });
  }

  getIncludeStatementError(statement: IncludeStatement, errorMessage: string) {
    return new errors.ParseError(`Can't #include ${statement.filename} from ${this.filename.path}: ${errorMessage}`, statement.loc!);
  }

  // ### Non-statements

  //     Identifier ::= Name

  parseIdentifier(): Identifier {
    this.markLocation();
    const identifier = this.token.value as string;
    if (this.token.type !== TokenType.Identifier) {
      errors.raiseUnexpectedToken('<name>', this.token);
    }
    this.lexer.next();
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
            this.lexer.next();
          }

        }
      } while (this.lexer.consume(','));

      if (!this.lexer.consume(')')) {
        this.errors.push(errors.createErrForToken(this.token, errMessages.expected, ')', this.token.value));

        // Discard tokens until we get a ')'
        while (this.token.value !== ')') {
          this.lexer.next();
        }
        // consume the ')'
        this.lexer.next();
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
          this.lexer.next();
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
        this.lexer.next();
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

  // Return the precedence priority of the operator.
  //
  // As unary `-` can't be distinguished from binary `-`, unary precedence
  // isn't described in this table but in `parseSubExpression()` itself.
  //
  // As this gets hit on every expression it's been optimized due to
  // the expensive CompareICStub which took ~8% of the parse time.

  binaryPrecedence(operator: string): number {
    const charCode = operator.charCodeAt(0);
    const length = operator.length;

    if (1 === length) {
      switch (charCode) {
      case 94: return 12; // ^
      case 42: case 47: case 37: case 92: return 10; // * / % \
      case 43: case 45: return 9; // + -
      case 38: return 6; // & (bitwise AND)
      case 124: return 4; // | (bitwise OR)
      case 60: case 62: return 3; // < >
      }
    } else if (2 === length) {
      switch (charCode) {
      case 46: return 8; // ..
      case 60: case 62:
        if('<<' === operator || '>>' === operator) {
          return 7;
        } // << >>
        return 3; // <= >=
      case 33: case 61: case 126: return 3; // == ~= !=
      case 111: return 1; // or
      case 94: return 5; // ^^ (bitwise XOR, pico-8 lua uses the normal bitwise XOR ~ as bitwise NOT)
      }
    } else if (3 === length) {
      switch (operator) {
      case '>>>': case '<<>': case '>><': return 7;
      case 'and': return 2;
      }
    }
    return 0;
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
      this.lexer.next();
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
        this.binaryPrecedence(operator) : 0;

      if (precedence === 0 || precedence <= minPrecedence) {
        break;
      }
      // Right-hand precedence operators
      if ('^' === operator || '..' === operator) {
        --precedence;
      }
      this.lexer.next();
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
        this.lexer.next();
        expression = this.parseExpectedExpression(flowContext);
        this.lexer.expect(']');
        return this.finishNode(AST.indexExpression(base, expression));
      case '.':
        this.pushLocation(marker);
        this.lexer.next();
        identifier = this.parseIdentifier();
        return this.finishNode(AST.memberExpression(base, '.', identifier));
      case ':':
        this.pushLocation(marker);
        this.lexer.next();
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
        this.lexer.next();

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
        this.lexer.next();
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
      this.lexer.next();
      return this.finishNode(AST.literal(type, value, raw));
    } else if (type === TokenType.Keyword && 'function' === value) {
      this.pushLocation(marker);
      this.lexer.next();
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
