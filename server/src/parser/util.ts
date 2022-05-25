import * as util from 'util';

// Helpers
// -------

// Iterate through an array of objects and return the index of an object
// with a matching property.

export function indexOfObject(array: any[], property: string, element: any) {
  for (let i = 0, length = array.length; i < length; ++i) {
    if (array[i][property] === element) {
      return i;
    }
  }

  return -1;
}

// A sprintf implementation using %index (beginning at 1) to input
// arguments in the format string.
//
// Example:
//
//     // Unexpected function in token
//     sprintf('Unexpected %2 in %1.', 'token', 'function');

export function sprintf(format: string, ...args: any[]): string {
  format = format.replace(/%(\d)/g, function (match, index) {
    return '' + args[index - 1] || '';
  });
  return format;
}

// equivalent to console.log(x), BUT with a really big depth. (default depth for
// console.log is 2.)
// Comes with optional label.
export function logObj(x: any, label?: string): void {
  const inspected = util.inspect(x, { depth: 90 });
  console.log(label ? `${label}: ${inspected}` : inspected);
}
