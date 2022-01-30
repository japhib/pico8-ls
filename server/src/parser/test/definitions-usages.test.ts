import { strictEqual as eq } from 'assert';
import { DefinitionsUsagesLookup } from '../definitions-usages';
import { TokenValue } from '../tokens';
import { Bounds } from '../types';
import { logObj } from '../util';
import { bounds, deepEquals, parse, tokenAt } from './test-utils';

// Simulates a Go To Definition request where we hand in a line
// and column number for where the user's cursor is currently,
// and we spit out the token at the location where the lookup
// would take us.
function goToDefinition(lookup: DefinitionsUsagesLookup, code: string, line: number, column: number): TokenValue | undefined {
  const defUs = lookup.lookup(line, column);
  if (!defUs) return undefined;

  const token = tokenAt(code, defUs.definitions[0].start.index);
  return token?.value;
}

function getDefinitions(lookup: DefinitionsUsagesLookup, line: number, column: number): Bounds[] {
  const defUs = lookup.lookup(line, column);
  if (!defUs) return [];

  return defUs.definitions;
}

function getUsages(lookup: DefinitionsUsagesLookup, line: number, column: number): Bounds[] {
  const defUs = lookup.lookup(line, column);
  if (!defUs) return [];

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

    it('adds warning for an unused parameter', () => {
      const { warnings } = parse('function somefn(a) print("hi") end');
      deepEquals(warnings, [{ type: 'Warning', message: 'a is defined but not used' }]);
    });

    it('adds warning for an unused local', () => {
      const { warnings } = parse('function somefn() local a = 1 end');
      deepEquals(warnings, [{ type: 'Warning', message: 'a is defined but not used' }]);
    });

    it('adds warning for an undefined variable in assignment', () => {
      const { warnings } = parse('local a\nb.c = a');
      deepEquals(warnings[0], { type: 'Warning', message: 'undefined variable: b' });
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
    deepEquals(definitions, [bounds(1, 17, 1, 18)]);
    deepEquals(usages, [bounds(1, 17, 1, 18), bounds(2, 8, 2, 9)]);
  });

  it('find definition/usages for function parameters assigned to member expression', () => {
    const { definitionsUsages, warnings } = parse(`function round(x)
  return flr(x+0.5)
end`);
    // Should be no warnings
    deepEquals(warnings, []);

    // Find defs/usages of x
    const { definitions, usages } = definitionsUsages.lookup(1, 15)!;
    deepEquals(definitions, [bounds(1, 15, 1, 16)]);
    deepEquals(usages, [bounds(1, 15, 1, 16), bounds(2, 13, 2, 14)]);
  });

  describe('member expressions', () => {
    it('find defs/usages for member variables', () => {
      const { definitionsUsages, warnings } = parse('a = {}\na.b = "1"\nprint(a.b)');

      // Should be no warnings
      deepEquals(warnings, []);

      // Find defs/usages of a
      {
        const { definitions, usages } = definitionsUsages.lookup(1, 0)!;
        deepEquals(definitions, [bounds(1, 0, 1, 1)]);
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
        deepEquals(getDefinitions(definitionsUsages, 1, 0), [bounds(1, 0, 1, 1)]);
        deepEquals(getDefinitions(definitionsUsages, 1, 1), [bounds(1, 0, 1, 1)]);
        deepEquals(getDefinitions(definitionsUsages, 2, 0), [bounds(1, 0, 1, 1)]);
        deepEquals(getDefinitions(definitionsUsages, 2, 1), [bounds(1, 0, 1, 1)]);
        deepEquals(getDefinitions(definitionsUsages, 3, 6), [bounds(1, 0, 1, 1)]);
        deepEquals(getDefinitions(definitionsUsages, 3, 7), [bounds(1, 0, 1, 1)]);
      }

      // Find defs/usages of a.b
      {
        const { definitions, usages } = definitionsUsages.lookup(2, 2)!;
        deepEquals(definitions, [bounds(2, 0, 2, 3)]);
        deepEquals(usages, [
          // a.b = "1" (just b)
          bounds(2, 0, 2, 3),
          // print(a.b)
          bounds(3, 6, 3, 9),
        ]);
        // Go to definition from all points around "b" in a.b
        deepEquals(getDefinitions(definitionsUsages, 2, 2), [bounds(2, 0, 2, 3)]);
        deepEquals(getDefinitions(definitionsUsages, 2, 3), [bounds(2, 0, 2, 3)]);
        deepEquals(getDefinitions(definitionsUsages, 3, 8), [bounds(2, 0, 2, 3)]);
        deepEquals(getDefinitions(definitionsUsages, 3, 9), [bounds(2, 0, 2, 3)]);
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
      deepEquals(definitions, [bounds(6, 2, 6, 5)]);
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
      deepEquals(definitions, [bounds(7, 2, 7, 8)]);
      deepEquals(usages, [
        // self.x = x
        bounds(7, 2, 7, 8),
        // return self.x, ...
        bounds(3, 9, 3, 15),
      ]);
    });
  });
});
