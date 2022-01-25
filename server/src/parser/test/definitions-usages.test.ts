import { strictEqual as eq } from 'assert';
import { DefinitionsUsagesLookup } from '../definitions-usages';
import { TokenValue } from '../tokens';
import { deepEquals, parse, tokenAt } from './test-utils';

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

function getUsages(lookup: DefinitionsUsagesLookup, line: number, column: number) {
  const defUs = lookup.lookup(line, column);
  if (!defUs) return undefined;

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
});