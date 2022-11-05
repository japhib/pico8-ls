
// Return the precedence priority of the operator.
//
// As unary `-` can't be distinguished from binary `-`, unary precedence
// isn't described in this table but in `Parser.parseSubExpression()` itself.
//
// As this gets hit on every expression it's been optimized due to
// the expensive CompareICStub which took ~8% of the parse time.

export default class Operators {

  static fakeMaxPrecedenceOperator = ';';
  static maxPrecedenceValue = 99;
  static minPrecedenceValue = 0;

  static binaryPrecedenceOf(operator: string): number {
    const charCode = operator.charCodeAt(0);
    const length = operator.length;

    if (1 === length) {
      switch (charCode) {
      case 59: return Operators.maxPrecedenceValue; // # (fake one, a "guard")
      case 94: return 12; // ^ (exponentiation)
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
    return Operators.minPrecedenceValue;
  }

  static doesNeedParenthesesIfOnTheRightSide(operator: string): boolean {
    const charCode = operator.charCodeAt(0);
    const length = operator.length;

    if (1 === length) {
      switch (charCode) {
      case 42: return false; // *
      case 43: return false; // +
      case 38: return false; // & (bitwise AND)
      case 124: return false; // | (bitwise OR)
      }
    } else if (2 === length) {
      switch (charCode) {
      case 46: return false; // ..
      case 61: return false; // ==
      case 111: return false; // or
      }
    } else if (3 === length) {
      switch (operator) {
      case 'and': return false;
      }
    }
    return true;
  }

}
