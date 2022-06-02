import { strictEqual as eq } from 'assert';
import { toReadableObj } from '../ast';
import { DefinitionsUsagesLookup } from '../definitions-usages';
import { TokenValue } from '../tokens';
import { Bounds } from '../types';
import { bounds, deepEquals, MockFileResolver, parse, tokenAt } from './test-utils';

// Simulates a Go To Definition request where we hand in a line
// and column number for where the user's cursor is currently,
// and we spit out the token at the location where the lookup
// would take us.
function goToDefinition(lookup: DefinitionsUsagesLookup, code: string, line: number, column: number): TokenValue | undefined {
  const defUs = lookup.lookup(line, column);
  if (!defUs) {
    return undefined;
  }

  const token = tokenAt(code, defUs.definitions[0].start.index);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return token?.value;
}

function getDefinitions(lookup: DefinitionsUsagesLookup, line: number, column: number): Bounds[] {
  const defUs = lookup.lookup(line, column);
  if (!defUs) {
    return [];
  }

  return defUs.definitions;
}

function getUsages(lookup: DefinitionsUsagesLookup, line: number, column: number): Bounds[] {
  const defUs = lookup.lookup(line, column);
  if (!defUs) {
    return [];
  }

  return defUs.usages;
}

describe('DefinitionsUsagesFinder', () => {
  it('declares a definition for a function', () => {
    const code = 'function somefn() end';
    const { definitionsUsages } = parse(code);
    // middle of 'somefn'
    eq(goToDefinition(definitionsUsages, code, 1, 11), 'somefn');
    // beginning of 'somefn'
    eq(goToDefinition(definitionsUsages, code, 1, 9), 'somefn');
    // end of 'somefn'
    eq(goToDefinition(definitionsUsages, code, 1, 15), 'somefn');
    // before 'somefn'
    eq(goToDefinition(definitionsUsages, code, 1, 8), undefined);
    // after 'somefn'
    eq(goToDefinition(definitionsUsages, code, 1, 16), undefined);
  });

  it('declares usages for a function', () => {
    const code = `function somefn()
  somefn()
end`;
    const { definitionsUsages } = parse(code);
    deepEquals(
      getUsages(definitionsUsages, 1, 9),
      [
        // First usage is the declaration itself on line 1
        { start: { line: 1, column: 9 } },
        // Second usage is the function call on line 2
        { start: { line: 2, column: 2 } },
      ],
    );
  });

  it('finds usages for a function before function is defined (early refs)', () => {
    const code = `
do_the_thing()
function do_the_thing() print('hi') end`;
    const { definitionsUsages } = parse(code);
    const { definitions, usages } = definitionsUsages.lookup(2, 1)!;

    deepEquals(definitions, [{ start: { line: 3, column: 9 } }]);
    deepEquals(usages, [
      // the definition
      { start: { line: 3, column: 9 } },
      // the usage
      { start: { line: 2, column: 0 } },
    ]);
  });

  it('declares a definition for variables', () => {
    const code = 'local a\nb = a';
    const { warnings, definitionsUsages } = parse(code);
    deepEquals(warnings, []);

    // lookup on the `a` in `b = a`
    const { definitions, usages } = definitionsUsages.lookup(2, 4)!;
    deepEquals(definitions, [ bounds(1, 6, 1, 7) ]);
    deepEquals(usages, [
      bounds(1, 6, 1, 7),
      bounds(2, 4, 2, 5),
    ]);
  });

  describe('warnings', () => {
    it('adds warning for an undefined variable in function call', () => {
      const { warnings } = parse('do_the_thing()');
      deepEquals(warnings, [{ type: 'Warning', message: 'undefined variable: do_the_thing' }]);
    });

    it('adds warning for an undefined variable in assignment', () => {
      const { warnings } = parse('a = b');
      deepEquals(warnings, [{ type: 'Warning', message: 'undefined variable: b' }]);
    });

    it('adds warning for an undefined variable in assignment to member expression', () => {
      const { warnings } = parse('a = {} a.member = b');
      deepEquals(warnings, [{ type: 'Warning', message: 'undefined variable: b' }]);
    });

    // TODO add these back in when bugs are fixed and unused-local warning is re-enabled
    it.skip('adds warning for an unused parameter', () => {
      const { warnings } = parse('function somefn(a) print("hi") end');
      deepEquals(warnings, [{ type: 'Warning', message: 'a is defined but not used' }]);
    });

    it.skip('adds warning for an unused local', () => {
      const { warnings } = parse('function somefn() local a = 1 end');
      deepEquals(warnings, [{ type: 'Warning', message: 'a is defined but not used' }]);
    });

    it('adds warning for an undefined variable in assignment', () => {
      const { warnings } = parse('local a\nb.c = a');
      deepEquals(warnings[0], { type: 'Warning', message: 'undefined variable: b' });
    });

    it('does not give warning for "self" usage in double-nested table', () => {
      const { warnings } = parse(`a2 = {
  self_fn = function() self.mem = 0 end,
  b2 = {
    self_fn = function() self.mem = 0 end,
  }
}`);
      deepEquals(warnings, []);
    });
  });

  it('find definition/usages for function parameter', () => {
    const { definitionsUsages, warnings } = parse(`function setv(v, x, y)
  v.x = x
  v.y = y
end`);
    // Should be no warnings
    deepEquals(warnings, []);

    // Find defs/usages of x
    const { definitions, usages } = definitionsUsages.lookup(1, 17)!;
    deepEquals(definitions, [ bounds(1, 17, 1, 18) ]);
    deepEquals(usages, [ bounds(1, 17, 1, 18), bounds(2, 8, 2, 9) ]);
  });

  it('find definition/usages for function parameters assigned to member expression', () => {
    const { definitionsUsages, warnings } = parse(`function round(x)
  return flr(x+0.5)
end`);
    // Should be no warnings
    deepEquals(warnings, []);

    // Find defs/usages of x
    const { definitions, usages } = definitionsUsages.lookup(1, 15)!;
    deepEquals(definitions, [ bounds(1, 15, 1, 16) ]);
    deepEquals(usages, [ bounds(1, 15, 1, 16), bounds(2, 13, 2, 14) ]);
  });

  describe('member expressions', () => {
    it('find defs/usages for member variables', () => {
      const { definitionsUsages, warnings } = parse('a = {}\na.b = "1"\nprint(a.b)');

      // Should be no warnings
      deepEquals(warnings, []);

      // Find defs/usages of a
      {
        const { definitions, usages } = definitionsUsages.lookup(1, 0)!;
        deepEquals(definitions, [ bounds(1, 0, 1, 1) ]);
        deepEquals(usages, [
          // a = {}
          bounds(1, 0, 1, 1),
          // a.b = "1"
          bounds(2, 0, 2, 1),
          // print(a.b)
          bounds(3, 6, 3, 7),
        ]);
        // Go to definition from the other locations of a.
        // Make sure to do "go to definition" from the 'a' part of the member expressions 'a.b',
        // so it takes you to the definition of 'a'.
        deepEquals(getDefinitions(definitionsUsages, 1, 0), [ bounds(1, 0, 1, 1) ]);
        deepEquals(getDefinitions(definitionsUsages, 1, 1), [ bounds(1, 0, 1, 1) ]);
        deepEquals(getDefinitions(definitionsUsages, 2, 0), [ bounds(1, 0, 1, 1) ]);
        deepEquals(getDefinitions(definitionsUsages, 2, 1), [ bounds(1, 0, 1, 1) ]);
        deepEquals(getDefinitions(definitionsUsages, 3, 6), [ bounds(1, 0, 1, 1) ]);
        deepEquals(getDefinitions(definitionsUsages, 3, 7), [ bounds(1, 0, 1, 1) ]);
      }

      // Find defs/usages of a.b
      {
        const { definitions, usages } = definitionsUsages.lookup(2, 2)!;
        deepEquals(definitions, [ bounds(2, 0, 2, 3) ]);
        deepEquals(usages, [
          // a.b = "1" (just b)
          bounds(2, 0, 2, 3),
          // print(a.b)
          bounds(3, 6, 3, 9),
        ]);
        // Go to definition from all points around "b" in a.b
        deepEquals(getDefinitions(definitionsUsages, 2, 2), [ bounds(2, 0, 2, 3) ]);
        deepEquals(getDefinitions(definitionsUsages, 2, 3), [ bounds(2, 0, 2, 3) ]);
        deepEquals(getDefinitions(definitionsUsages, 3, 8), [ bounds(2, 0, 2, 3) ]);
        deepEquals(getDefinitions(definitionsUsages, 3, 9), [ bounds(2, 0, 2, 3) ]);
      }
    });

    it('gives warning for undefined variable on the member expr base', () => {
      const { warnings } = parse('a.b()');
      deepEquals(warnings, [
        { type: 'Warning', message: 'undefined variable: a' },
      ]);
    });

    it('unknown member variables do not create warnings, and still can find usages without definitions', () => {
      const { warnings, definitionsUsages } = parse(`function deconstruct(v)
  return v.x, v.y
end

function setv(v, x, y)
  v.x = x
  v.y = y
end`);

      deepEquals(warnings, []);

      // on the x part of v.x
      const { definitions, usages } = definitionsUsages.lookup(2, 11)!;
      deepEquals(definitions, [ bounds(6, 2, 6, 5) ]);
      deepEquals(usages, [
        // v.x = x
        bounds(6, 2, 6, 5),
        // return v.x, ...
        bounds(2, 9, 2, 12),
      ]);
    });

    it('unknown self variables do not create warnings, and still can find usages without definitions', () => {
      const { warnings, definitionsUsages } = parse(`vector={}
function vector:deconstruct()
  return self.x, self.y
end

function vector:set(x, y)
  self.x = x
  self.y = y
end`);

      deepEquals(warnings, []);

      // on the x part of self.x
      const { definitions, usages } = definitionsUsages.lookup(3, 15)!;
      deepEquals(definitions, [ bounds(7, 2, 7, 8) ]);
      deepEquals(usages, [
        // self.x = x
        bounds(7, 2, 7, 8),
        // return self.x, ...
        bounds(3, 9, 3, 15),
      ]);
    });

    it('handles deeply nested member expression usages/definitions', () => {
      const { warnings, definitionsUsages } = parse(`
a = {}
a.b = {}
a.b.c = {}
a.b.c.d = {}`);

      deepEquals(warnings, []);

      // a
      {
        const { definitions, usages } = definitionsUsages.lookup(2, 0)!;
        deepEquals(definitions, [ bounds(2, 0, 2, 1) ]);
        deepEquals(usages, [
          bounds(2, 0, 2, 1),
          bounds(3, 0, 3, 1),
          bounds(4, 0, 4, 1),
          bounds(5, 0, 5, 1),
        ]);
      }

      // b
      {
        const { symbolName, definitions, usages } = definitionsUsages.lookup(3, 2)!;
        eq(symbolName, 'a.b');
        deepEquals(definitions, [ bounds(3, 0, 3, 3) ]);
        deepEquals(usages, [
          bounds(3, 0, 3, 3),
          bounds(4, 0, 4, 3),
          bounds(5, 0, 5, 3),
        ]);
      }

      // c
      {
        const { symbolName, definitions, usages } = definitionsUsages.lookup(4, 4)!;
        eq(symbolName, 'a.b.c');
        deepEquals(definitions, [ bounds(4, 0, 4, 5) ]);
        deepEquals(usages, [
          bounds(4, 0, 4, 5),
          bounds(5, 0, 5, 5),
        ]);
      }

      // d
      {
        const { symbolName, definitions, usages } = definitionsUsages.lookup(5, 6)!;
        eq(symbolName, 'a.b.c.d');
        deepEquals(definitions, [ bounds(5, 0, 5, 7) ]);
        deepEquals(usages, [
          bounds(5, 0, 5, 7),
        ]);
      }
    });

    it('handles deeply nested instances of "self" (assignment version)', () => {
      const { warnings, definitionsUsages } = parse(`
a = {}
a.self_fn = function() self.mem = 0 end
a.mem()
a.b = {}
a.b.self_fn = function() self.mem = 0 end
a.b.mem()
a.b.c = {}
a.b.c.mem() -- function call is before definition!
a.b.c.self_fn = function() self.mem = 0 end`);

      deepEquals(warnings, []);

      // "self" on "self.mem" (line 3) takes you to `a`
      {
        const { definitions } = definitionsUsages.lookup(3, 25)!;
        deepEquals(definitions, [ bounds(2, 0, 2, 1) ]);
      }

      // "a.mem"
      {
        const { symbolName, definitions, usages } = definitionsUsages.lookup(3, 30)!;
        eq(symbolName, 'a.mem'); // instead of self.mem
        deepEquals(definitions, [ bounds(3, 23, 3, 31) ]);
        deepEquals(usages, [ bounds(3, 23, 3, 31), bounds(4, 0, 4, 5) ]);
      }

      // "a.b.mem"
      {
        const { symbolName, definitions, usages } = definitionsUsages.lookup(6, 32)!;
        eq(symbolName, 'a.b.mem');
        deepEquals(definitions, [ bounds(6, 25, 6, 33) ]);
        deepEquals(usages, [ bounds(6, 25, 6, 33), bounds(7, 0, 7, 7) ]);
      }

      // "a.b.c.mem"
      {
        const { symbolName, definitions, usages } = definitionsUsages.lookup(10, 34)!;
        eq(symbolName, 'a.b.c.mem');
        deepEquals(definitions, [ bounds(10, 27, 10, 35) ]);
        deepEquals(usages, [ bounds(10, 27, 10, 35), bounds(9, 0, 9, 9) ]);
      }
    });

    it('handles deeply nested instances of "self" (function version)', () => {
      const { warnings, definitionsUsages } = parse(`
a = {}
function a.self_fn() self.mem = 0 end
a.mem()
a.b = {}
function a.b:self_fn() self.mem = 0 end
a.b.mem()`);

      deepEquals(warnings, []);

      // "self" on "self.mem" (line 3) takes you to `a`
      {
        const { definitions } = definitionsUsages.lookup(3, 23)!;
        deepEquals(definitions, [ bounds(2, 0, 2, 1) ]);
      }

      // "a.mem"
      {
        const { symbolName, definitions, usages } = definitionsUsages.lookup(3, 28)!;
        eq(symbolName, 'a.mem'); // instead of self.mem
        deepEquals(definitions, [ bounds(3, 21, 3, 29) ]);
        deepEquals(usages, [ bounds(3, 21, 3, 29), bounds(4, 0, 4, 5) ]);
      }

      // "a.b.mem"
      {
        const { symbolName, definitions, usages } = definitionsUsages.lookup(6, 30)!;
        eq(symbolName, 'a.b.mem');
        deepEquals(definitions, [ bounds(6, 23, 6, 31) ]);
        deepEquals(usages, [ bounds(6, 23, 6, 31), bounds(7, 0, 7, 7) ]);
      }
    });

    it('handles deeply nested instances of "self" (table version)', () => {
      const { warnings, definitionsUsages } = parse(`a = {
  self_fn = function() self.mem = 0 end,
  b = {
    self_fn = function() self.mem = 0 end,
    c = {
      self_fn = function() self.mem = 0 end,
    }
  }
}
a.mem()
a.b.mem()
a.b.c.mem()
`);

      deepEquals(warnings, []);

      // "self" on "self.mem" (line 2) takes you to `a`
      {
        const { definitions } = definitionsUsages.lookup(2, 24)!;
        deepEquals(definitions, [ bounds(1, 0, 1, 1) ]);
      }

      // "a.mem"
      {
        const { symbolName, definitions, usages } = definitionsUsages.lookup(2, 29)!;
        eq(symbolName, 'a.mem'); // instead of self.mem
        deepEquals(definitions, [ bounds(2, 23, 2, 31) ]);
        deepEquals(usages, [ bounds(2, 23, 2, 31), bounds(10, 0, 10, 5) ]);
      }

      // "a.b.mem"
      {
        const { symbolName, definitions, usages } = definitionsUsages.lookup(4, 31)!;
        eq(symbolName, 'b.mem');
        deepEquals(definitions, [ bounds(4, 25, 4, 33) ]);
        deepEquals(usages, [ bounds(4, 25, 4, 33), bounds(11, 0, 11, 7) ]);
      }

      // "a.b.c.mem"
      {
        const { symbolName, definitions, usages } = definitionsUsages.lookup(6, 33)!;
        eq(symbolName, 'c.mem');
        deepEquals(definitions, [ bounds(6, 27, 6, 35) ]);
        deepEquals(usages, [ bounds(6, 27, 6, 35), bounds(12, 0, 12, 9) ]);
      }
    });
  });

  describe('#include statements (in including file)', () => {
    it('finds the definition of a global defined in an include statement', () => {
      const fileResolver = new MockFileResolver();
      fileResolver.loadFileContents = () => 'local a = 5';

      const { warnings, definitionsUsages } = parse('#include other_file.lua\nprint(a)', false, fileResolver);
      deepEquals(warnings, []);

      const { symbolName, definitions, usages } = definitionsUsages.lookup(2, 6)!;
      eq(symbolName, 'a');

      // The definition in 'other_file.lua'
      deepEquals(definitions, [ bounds(1, 6, 1, 7) ] );
      eq(definitions[0].start.filename.path, 'other_file.lua');

      // Usages:
      // #1: the definition in 'other_file.lua'
      eq(usages.length, 2);
      deepEquals(usages[0], bounds(1, 6, 1, 7));
      eq(usages[0].start.filename.path, 'other_file.lua');
      // #2: the usage in the main file ("main_test_file" is passed in as the
      // main filename by the "parse" utility function above)
      deepEquals(usages[1], bounds(2, 6, 2, 7));
      eq(usages[1].start.filename.path, 'main_test_file');
    });

    it('finds the usage of a global used in an include statement', () => {
      const fileResolver = new MockFileResolver();
      fileResolver.loadFileContents = () => 'print(a)';

      const { warnings, definitionsUsages } = parse('local a = 5\n#include other_file.lua', false, fileResolver);
      deepEquals(warnings, []);

      const { symbolName, definitions, usages } = definitionsUsages.lookup(1, 6)!;
      eq(symbolName, 'a');

      // The main definition
      deepEquals(definitions, [ bounds(1, 6, 1, 7) ] );
      eq(definitions[0].start.filename.path, 'main_test_file');

      // Usages:
      // #1: the main definition
      eq(usages.length, 2);
      deepEquals(usages[0], bounds(1, 6, 1, 7));
      eq(usages[0].start.filename.path, 'main_test_file');
      // #2: the usage in the included file
      deepEquals(usages[1], bounds(1, 6, 1, 7));
      eq(usages[1].start.filename.path, 'other_file.lua');
    });
  });
});

