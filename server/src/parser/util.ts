// Helpers
// -------

// Iterate through an array of objects and return the index of an object
// with a matching property.

export function indexOfObject(array: any[], property: string, element: any) {
  for (let i = 0, length = array.length; i < length; ++i) {
    if (array[i][property] === element) return i;
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