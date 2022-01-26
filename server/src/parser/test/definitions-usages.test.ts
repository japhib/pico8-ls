import { strictEqual as eq } from 'assert';
import { DefinitionsUsagesLookup } from '../definitions-usages';
import { TokenValue } from '../tokens';
import { Bounds } from '../types';
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

  it('adds warning for an undefined variable', () => {
    const { warnings } = parse('do_the_thing()');
    deepEquals(warnings, [{ type: 'Warning', message: 'undefined variable: do_the_thing' }]);
  });

  it('find definition/usages for function parameter', () => {
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
});
