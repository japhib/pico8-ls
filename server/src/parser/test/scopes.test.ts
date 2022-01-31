import { DefUsagesScopeType } from '../definitions-usages';
import { CodeLocation } from '../types';
import { bounds, deepEquals, parse } from './test-utils';

function codeLoc(line: number, column: number): CodeLocation {
  return {
    line,
    column,
    // (note index is 0 since it's unused in these test scenarios)
    index: 0,
  };
}

describe('Scopes', () => {
  it('Finds the right scopes for function definitions', () => {
    const code = `function fn()
  local a
  while true do
    print('hi')
  end
end

function fn2()
end`;
    const { scopes } = parse(code, true);
    deepEquals(scopes, {
      type: DefUsagesScopeType.Global,
      children: [
        // first function
        { name: 'fn', type: DefUsagesScopeType.Function, loc: bounds(1, 0, 6, 3), children: [
          // the while loop
          { type: DefUsagesScopeType.Other, loc: bounds(3, 2, 5, 5) },
        ] },
        // second function
        { name: 'fn2', type: DefUsagesScopeType.Function, loc: bounds(8, 0, 9, 3), children: [] },
      ],
    });

    // Lookup scope inside the first function (inside `local a`)
    deepEquals(scopes?.lookupScopeFor(codeLoc(2, 3)), { name: 'fn' });
    // Lookup scope inside while loop (inside `print('hi')`)
    deepEquals(scopes?.lookupScopeFor(codeLoc(4, 6)), { type: DefUsagesScopeType.Other });
    // Lookup scope after first function
    deepEquals(scopes?.lookupScopeFor(codeLoc(7, 0)), { type: DefUsagesScopeType.Global });
    // Lookup scope inside second function
    deepEquals(scopes?.lookupScopeFor(codeLoc(9, 0)), { name: 'fn2' });
  });

  it('Gets the right symbols at each layer of scope', () => {
    const code = `local a
function fn()
  local b
  while true do
    local c
  end
end

function fn2()
  local d
end`;
    const { scopes } = parse(code, true);
    // Lookup symbols inside first function call
    deepEquals(scopes?.lookupScopeFor(codeLoc(3, 2)).allSymbols(), ['b', 'a', 'fn', 'fn2']);
    // Lookup scope inside while loop
    deepEquals(scopes?.lookupScopeFor(codeLoc(5, 4)).allSymbols(), ['c', 'b', 'a', 'fn', 'fn2']);
    // Lookup scope after first function
    deepEquals(scopes?.lookupScopeFor(codeLoc(8, 0)).allSymbols(), ['a', 'fn', 'fn2']);
    // Lookup scope inside second function
    deepEquals(scopes?.lookupScopeFor(codeLoc(10, 0)).allSymbols(), ['d', 'a', 'fn', 'fn2']);
  });
});
