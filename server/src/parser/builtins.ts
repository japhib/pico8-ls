export type BuiltinFunctionInfo = {
  sig?: string,
  desc?: string,
  params?: string[]
  deprecated?: boolean,
};

// A list of all the built-in functions of PICO-8
export const Builtins: { [key: string]: BuiltinFunctionInfo } = {
  circ: {
    sig: 'circ( x, y, [r,] [col] )',
    desc: 'Draws a circle shape, without fill.',
    params: [
      'x: The x coordinate of the center of the circle.',
      'y: The y coordinate of the center of the circle.',
      'r: The radius of the circle, in pixels. If omitted, the radius will be 4.',
      'col: The color of the circle and fill. If omitted, the color from the draw state is used.',
    ],
  },
  cursor: {
    sig: 'cursor( [x,] [y,] [col] )',
    desc: 'Sets the left-margin cursor position for print().',
    params: [
      'x: The x coordinate of the upper left corner of the line. The default is 0.',
      'y: The y coordinate of the upper left corner of the line. The default is 0.',
      'col: (Optional) The palette index to set the pen color to.',
      'return-value: An x,y,c tuple representing the previous cursor position and color.',
    ],
  },
  cls: {
    sig: 'cls( [color] )',
    desc: 'Clears the graphics buffer.',
    params: [
      'color: A color to use for the background. The default is 0 (black).',
    ],
  },
  reset: {
    sig: 'reset( )',
    desc: 'Reset the values in RAM from 0x5f00..0x5f7f to their default values. This includes the palette, camera position, clipping, and fill pattern.',
  },
  info: {
    sig: 'info( )',
    desc: 'Print out some information about the cartridge, including code size, tokens, and compressed size.',
  },
  ovalfill: {
    sig: 'ovalfill( x0, y0, x1, y1, [col] )',
    desc: 'Draws a filled oval shape.',
    params: [
      'x0: The x coordinate of the upper left corner.',
      'y0: The y coordinate of the upper left corner.',
      'x1: The x coordinate of the lower right corner.',
      'y1: The y coordinate of the lower right corner.',
      'col: The color of the oval. If omitted, the color from the draw state is used.',
    ],
  },
  circfill: {
    sig: 'circfill( x, y, [r,] [col] )',
    desc: 'Draws a filled-in circle shape.',
    params: [
      'x: The x coordinate of the center of the circle.',
      'y: The y coordinate of the center of the circle.',
      'r: The radius of the circle, in pixels. If omitted, the radius will be 4.',
      'col: The color of the circle and fill. If omitted, the color from the draw state is used.',
    ],
  },
  fget: {
    sig: 'fget( n, [f] )',
    desc: 'Gets the value of a flag of a sprite.',
    params: [
      'n: The sprite number.',
      'f: The flag index (0-7). If omitted, a bit field of all flags is returned.',
    ],
  },
  color: {
    sig: 'color( [col] )',
    desc: 'Sets the draw color in the draw state.',
    params: [ 'col: The color number. Default is 6 (light gray).' ],
  },
  pget: {
    sig: 'pget( x, y )',
    desc: 'Gets the color value of a pixel at the given coordinates.',
    params: [ 'x: The x coordinate.', 'y: The y coordinate.' ],
  },
  line: {
    sig: 'line( [x0,] [y0,] [x1,] [y1,] [color] )',
    desc: 'Draws a line between two points.',
    params: [
      'x0: The x coordinate of the start of the line. If omitted, the x coordinate of the end of the previous line is used, or 0 if no previous line has been drawn.',
      'y0: The y coordinate of the start of the line. If omitted, the y coordinate of the end of the previous line is used, or 0 if no previous line has been drawn.',
      'x1: The x coordinate of the end of the line.',
      'y1: The y coordinate of the end of the line.',
      'color: The color of the line. If omitted, the color from the draw state is used. This also sets the color in the draw state.',
    ],
  },
  rect: {
    sig: 'rect( x0, y0, x1, y1, [col] )',
    desc: 'Draws an empty rectangle shape.',
    params: [
      'x0: The x coordinate of the upper left corner.',
      'y0: The y coordinate of the upper left corner.',
      'x1: The x coordinate of the lower right corner.',
      'y1: The y coordinate of the lower right corner.',
      'col: The color of the rectangle border. If omitted, the color from the draw state is used.',
    ],
  },
  palt: {
    sig: 'palt( [col,] [t] )',
    desc: 'Change the transparency of a color in the draw state for subsequent draw calls.',
    params: [
      'col: The number of the color to modify.',
      't: If true, treat this color as transparent. If false, treat this color as opaque.',
    ],
  },
  oval: {
    sig: 'oval( x0, y0, x1, y1, [col] )',
    desc: 'Draws an empty oval shape.',
    params: [
      'x0: The x coordinate of the upper left corner.',
      'y0: The y coordinate of the upper left corner.',
      'x1: The x coordinate of the lower right corner.',
      'y1: The y coordinate of the lower right corner.',
      'col: The color of the oval\'s border. If omitted, the color from the draw state is used.',
    ],
  },
  pset: {
    sig: 'pset( x, y, [c] )',
    desc: 'Sets a pixel in the graphics buffer.',
    params: [
      'x: The x coordinate.',
      'y: The y coordinate.',
      'c: The color value. If not specified, uses the current color of the draw state.',
    ],
  },
  fillp: {
    sig: 'fillp( [pat] )',
    desc: 'Sets the fill pattern.',
    params: [ 'pat: A bitfield representing the fill pattern to use.' ],
  },
  flip: {
    sig: 'flip( )',
    desc: 'Copies the graphics buffer to the screen, then synchronizes to the next frame at 30 frames per second.',
    params: [],
  },
  spr: {
    sig: 'spr( n, x, y, [w,] [h,] [flip_x,] [flip_y] )',
    desc: 'Draws a sprite, or a range of sprites, on the screen.',
    params: [
      'n: The sprite number. When drawing a range of sprites, this is the upper-left corner.',
      'x: The x coordinate.',
      'y: The y coordinate.',
      'w: The width of the range, as a number of sprites. Non-integer values may be used to draw partial sprites. The default is 1.0.',
      'h: The height of the range, as a number of sprites. Non-integer values may be used to draw partial sprites. The default is 1.0.',
      'flip_x: If true, the sprite is drawn inverted left to right. The default is false.',
      'flip_y: If true, the sprite is drawn inverted top to bottom. The default is false.',
    ],
  },
  sget: {
    sig: 'sget( x, y )',
    desc: 'Gets the color value of a pixel on the sprite sheet.',
    params: [
      'x: The x coordinate on the sprite sheet.',
      'y: The y coordinate on the sprite sheet.',
    ],
  },
  print: {
    sig: 'print( text, [x,] [y,] [color] )',
    desc: 'Prints a string of characters to the screen.',
    params: [
      'text: The Lua string of characters to print.',
      'x: The x coordinate of the upper left corner to start printing.',
      'y: The y coordinate of the upper left corner to start printing.',
      'color: The color to use for the text.',
      'return-value: The x coordinate of the next character to be printed (can be used to calculate printed width)',
    ],
  },
  pal: {
    sig: 'pal( c0, c1, [p] )',
    desc: 'Changes the draw state so all instances of a given color are replaced with a new color.',
    params: [
      'c0: The number of the original color to replace.',
      'c1: The number of the new color to use instead.',
      'p: 0 to modify the palette used by draw operations, 1 to modify the palette for the screen already drawn, or 2 to modify the secondary screen palette. The default is 0.',
    ],
  },
  sset: {
    sig: 'sset( x, y, [c] )',
    desc: 'Sets the color value of a pixel on the sprite sheet.',
    params: [
      'x: The x coordinate on the sprite sheet.',
      'y: The y coordinate on the sprite sheet.',
      'c: The color value to set. If unspecified, the color of the current draw state will be used.',
    ],
  },
  camera: {
    sig: 'camera( [x,] [y] )',
    desc: 'Sets the camera offset in the draw state.',
    params: [
      'x: The x offset, in pixels, to subtract from future draw coordinates. (default 0)',
      'y: The y offset, in pixels, to subtract from future draw coordinates. (default 0)',
      'return-value: An x,y tuple representing the previous camera offset.',
    ],
  },
  ipairs: {},
  clip: {
    sig: 'clip( x, y, w, h, [clip_previous] )',
    desc: 'Sets the clipping region in the draw state.',
    params: [
      'x: The x coordinate of the upper left corner of the clipping rectangle.',
      'y: The y coordinate of the upper left corner of the clipping rectangle.',
      'w: The width of the clipping rectangle, in pixels.',
      'h: The height of the clipping rectangle, in pixels.',
      'clip_previous: If true, the new clipping rectangle is formed by clipping it to the area of the one currently specified within the draw state.',
      'return-value: An x,y,w,h tuple representing the previous clipping rectangle.',
    ],
  },
  mset: {
    sig: 'mset( celx, cely, snum )',
    desc: 'Sets a cell on the map to a new sprite number.',
    params: [
      'celx: The column (x) coordinate of the cell.',
      'cely: The row (y) coordinate of the cell.',
      'snum: The new sprite number to store.',
    ],
  },
  mget: {
    sig: 'mget( celx, cely )',
    desc: 'Gets the sprite number assigned to a cell on the map.',
    params: [
      'celx: The column (x) coordinate of the cell.',
      'cely: The row (y) coordinate of the cell.',
    ],
  },
  next: {
    sig: 'next( tbl, [key] )',
    desc: 'A stateless iterator of key-value pairs for all elements in a table.',
    params: [ 'tbl: The table.', 'key: The current key.' ],
  },
  band: {
    sig: 'band( first, second )',
    desc: 'Calculates the bitwise-and of two numbers.',
    params: [
      'first: The first number.',
      'second: The second number.',
      'return-value: The bitwise-and of first and second.',
    ],
    deprecated: true,
  },
  unpack: {
    sig: 'unpack( tbl, [i,] [j] )',
    desc: 'Returns the elements from the given table.',
    params: [
      'tbl: The table to unpack.',
      'i: First index to unpack. Default is 1.',
      'j: Last index to unpack. Default is #tbl.',
    ],
  },
  setmetatable: {
    sig: 'setmetatable( tbl, metatbl )',
    desc: 'Updates the metatable for a table.',
    params: [
      'tbl: The table whose metatable to modify.',
      'metatbl: The new metatable.',
      'return-value: The same tbl that was passed in.',
    ],
  },
  fset: {
    sig: 'fset( n, [f,] v )',
    desc: 'Sets the value of a flag of a sprite.',
    params: [
      'n: The sprite number.',
      'f: The flag index (0-7). If omitted, a bit field of all flags is returned.',
      'v: The value, either true or false if the flag index is specified, or the bit field of all flags if it is not.',
    ],
  },
  sub: {
    sig: 'sub( str, start, [end] )',
    desc: 'Gets the substring of a string.',
    params: [
      'str: The string.',
      'start: The starting index, counting from 1 at the left, or -1 at the right.',
      'end: The ending index, counting from 1 at the left, or -1 at the right. (default -1)',
    ],
  },
  split: {
    sig: 'split( str, [separator,] [convert_numbers] )',
    desc: 'Split a string into a table of elements delimited by the given separator (defaults to ",").',
    params: [
      'str: The string.',
      'separator: The separator (defaults to ",").',
      'convert_numbers: When convert_numbers is true, numerical tokens are stored as numbers (defaults to true).',
    ],
  },
  rectfill: {
    sig: 'rectfill( x0, y0, x1, y1, [col] )',
    desc: 'Draws a filled-in rectangle shape.',
    params: [
      'x0: The x coordinate of the upper left corner.',
      'y0: The y coordinate of the upper left corner.',
      'x1: The x coordinate of the lower right corner.',
      'y1: The y coordinate of the lower right corner.',
      'col: The color of the rectangle and fill. If omitted, the color from the draw state is used.',
    ],
  },
  sfx: {
    sig: 'sfx( n, [channel,] [offset,] [length] )',
    desc: 'Plays a sound effect.',
    params: [
      'n: The number of the sound effect to play (0-63), -1 to stop playing sound on the given channel, or -2 to release the sound of the given channel from looping.',
      'channel: The channel to use for the sound effect (0-3). The default is -1, which chooses an available channel automatically. Can be -2 to stop playing the given sound effect on any channels it plays on.',
      'offset: The note position in the sound effect to start playing (0-31). The default is 0 (the beginning).',
      'length: The number of notes in the sound effect to play (0-31). The default is to play the entire sound effect.',
    ],
  },
  printh: {
    sig: 'printh( str, [filename,] [overwrite] )',
    desc: 'Prints a string to a console window that is running PICO-8, or to a file or the clipboard.',
    params: [
      'str: The string to print.',
      'filename: The name of a file to append the output, instead of printing to the console. If this is the string "@clip", the message replaces the contents of the system clipboard instead of writing to a file.',
      'overwrite: If filename is provided and is the name of a file and overwrite is true, this overwrites the file. The default is false, which appends the message to the end of the file.',
    ],
  },
  getmetatable: {
    sig: 'getmetatable( tbl )',
    desc: 'Gets the metatable for a table.',
    params: [ 'tbl: The table.' ],
  },
  pack: {
    sig: 'pack( ... )',
    desc: 'Creates a table from the given parameters.',
    params: [ '...: parameters' ],
  },
  sin: {
    sig: 'sin( angle )',
    desc: 'Calculates the sine of an angle.',
    params: [
      'angle: The angle, using a full circle range of 0.0-1.0 measured clockwise (0.0 to the right).',
    ],
  },
  memcpy: {
    sig: 'memcpy( destaddr, sourceaddr, len )',
    desc: 'Copies a region of memory to another location in memory.',
    params: [
      'destaddr: The address of the first byte of the destination.',
      'sourceaddr: The address of the first byte of the memory to copy.',
      'len: The length of the memory region to copy, as a number of bytes.',
    ],
  },
  sqrt: {
    sig: 'sqrt( num )',
    desc: 'Calculates the square root of a number.',
    params: [ 'num: The number. Must be positive.' ],
  },
  memset: {
    sig: 'memset( destaddr, val, len )',
    desc: 'Writes a byte value to every address in a region of memory.',
    params: [
      'destaddr: The address of the first memory location to write.',
      'val: The byte value to write.',
      'len: The length of the region of memory to write, as a number of bytes.',
    ],
  },
  all: {
    sig: 'all( tbl )',
    desc: 'Returns an iterator for all non-nil items in a sequence in a table, for use with for...in.',
    params: [
      'tbl: The table to iterate.',
      'return-value: An interator function that can be used with for...in to iterate over tbl.',
    ],
  },
  flr: {
    sig: 'flr( num )',
    desc: 'Returns the nearest integer at or below a number (its "floor").',
    params: [
      'num: The number.',
      'return-value: The nearest integer at or below num.',
    ],
  },
  sspr: {
    sig: 'sspr( sx, sy, sw, sh, dx, dy, [dw,] [dh,] [flip_x,] [flip_y] )',
    desc: 'Draws a rectangle of pixels from the sprite sheet, optionally stretching the image to fit a rectangle on the screen.',
    params: [
      'sx: The x coordinate of the upper left corner of the rectangle in the sprite sheet.',
      'sy: The y coordinate of the upper left corner of the rectangle in the sprite sheet.',
      'sw: The width of the rectangle in the sprite sheet, as a number of pixels.',
      'sh: The height of the rectangle in the sprite sheet, as a number of pixels.',
      'dx: The x coordinate of the upper left corner of the rectangle area of the screen.',
      'dy: The y coordinate of the upper left corner of the rectangle area of the screen.',
      'dw: The width of the rectangle area of the screen. The default is to match the image width (sw).',
      'dh: The height of the rectangle area of the screen. The default is to match the image height (sh).',
      'flip_x: If true, the image is drawn inverted left to right. The default is false.',
      'flip_y: If true, the image is drawn inverted top to bottom. The default is false.',
    ],
  },
  deli: {
    sig: 'deli( table, [index] )',
    desc: 'Removes the element at the given index of a sequence in a table.',
    params: [
      'table: The table.',
      'index: The index for the value to be removed.',
    ],
  },
  count: {
    sig: 'count( tbl, [v] )',
    desc: 'Returns the length of a table, or the number of instances of a value within a table.',
    params: [ 'tbl: The table.', 'v: Value to count occurrences of.' ],
  },
  peek: {
    sig: 'peek( addr, [n] )',
    desc: 'Reads one or more bytes from contiguous memory locations starting at addr.',
    params: [
      'addr: The address of the first memory location.',
      'n: The number of bytes to return. (1 by default, 8192 max.)',
    ],
  },
  abs: {
    sig: 'abs( num )',
    desc: 'Returns the absolute value of a number.',
    params: [ 'num: The number.', 'return-value: The absolute value of num.' ],
  },
  atan2: {
    sig: 'atan2( dx, dy )',
    desc: 'Calculates the arctangent of dy/dx, the angle formed by the vector on the unit circle. The result is adjusted to represent the full circle.',
    params: [
      'dx: The horizontal component.',
      'dy: The vertical component.',
      'return-value: The angle of the line from 0,0 to dx,dy.',
    ],
  },
  min: {
    sig: 'min( first, [second] )',
    desc: 'Returns the minimum of two numbers.',
    params: [
      'first: The first number.',
      'second: The second number. (default 0)',
    ],
  },
  lshr: {
    sig: 'lshr( num, bits )',
    desc: 'Shifts the bits of a number to the right, using logical shift.',
    params: [ 'num: The number.', 'bits: The number of bits to shift.' ],
    deprecated: true,
  },
  cos: {
    sig: 'cos( angle )',
    desc: 'Calculates the cosine of an angle.',
    params: [ 'angle: The angle, using a full circle range of 0.0-1.0.' ],
  },
  mid: {
    sig: 'mid( first, second, third )',
    desc: 'Returns the middle of three numbers. Also useful for clamping.',
    params: [
      'first: The first number.',
      'second: The second number.',
      'third: The third number.',
    ],
  },
  rawequals: {},
  tline: {
    sig: 'New in PICO-8 0.2.0.',
    desc: 'Draws a textured line between two points, sampling the map for texture data.',
    params: [
      'x0: The x coordinate of the start of the line.',
      'y0: The y coordinate of the start of the line.',
      'x1: The x coordinate of the end of the line.',
      'y1: The y coordinate of the end of the line.',
      'mx: The x coordinate to begin sampling the map, expressed in (fractional) map tiles.',
      'my: The y coordinate to begin sampling the map, expressed in (fractional) map tiles.',
      'mdx: The amount to add to mx after each pixel is drawn, expressed in (fractional) map tiles. Default is 1/8 (move right one map pixel).',
      'mdy: The amount to add to mx after each pixel is drawn, expressed in (fractional) map tiles. Default is 0 (a horizontal line).',
    ],
  },
  bnot: {
    sig: 'bnot( num )',
    desc: 'Calculates the bitwise not of a number.',
    params: [ 'num: The number.', 'return-value: The bitwise-not of num.' ],
    deprecated: true,
  },
  pairs: {
    sig: 'pairs( tbl )',
    desc: 'Returns an iterator of key-value pairs for all elements in a table, for use with for...in.',
    params: [ 'tbl: The table.' ],
  },
  ceil: {
    sig: 'ceil( num )',
    desc: 'Returns the nearest integer at or above a number (its "ceiling").',
    params: [
      'num: The number.',
      'return-value: The nearest integer at or above num.',
    ],
  },
  foreach: {
    sig: 'foreach( tbl, func )',
    desc: 'Calls a function for each element in a sequence in a table.',
    params: [
      'tbl: The table.',
      'func: The function to call. The function should accept an element as its sole argument.',
    ],
  },
  dget: {
    sig: 'dget( index )',
    desc: 'Gets a value from persistent cartridge data.',
    params: [ 'index: The index of the value, 0 to 63.' ],
  },
  rnd: {
    sig: 'rnd( [max] )',
    desc: 'Generates a random number between 0 and the given maximum exclusive, or returns a random element from a 1-based table sequence.',
    params: [ 'max: The range, non-inclusive. Defaults to 1.' ],
  },
  btn: {
    sig: 'btn( [i,] [p] )',
    desc: 'Tests if a button is being pressed at this moment.',
    params: [
      'i: The button number.',
      'p: The player number.',
      'return-value: If a button is specified, then true or false, otherwise a bitfield for multiple players.',
    ],
  },
  srand: {
    sig: 'srand( val )',
    desc: 'Initializes the random number generator with an explicit seed value.',
    params: [ 'val: The seed value.' ],
  },
  map: {
    sig: 'map( celx, cely, sx, sy, celw, celh, [layer] )',
    desc: 'Draws a portion of the map to the graphics buffer.',
    params: [
      'celx: The column location of the map cell in the upper left corner of the region to draw, where 0 is the leftmost column.',
      'cely: The row location of the map cell in the upper left corner of the region to draw, where 0 is the topmost row.',
      'sx: The x coordinate of the screen to place the upper left corner.',
      'sy: The y coordinate of the screen to place the upper left corner.',
      'celw: The number of map cells wide in the region to draw.',
      'celh: The number of map cells tall in the region to draw.',
      'layer: If specified, only draw sprites that have flags set for every bit in this value (a bitfield). The default is 0 (draw all sprites).',
    ],
  },
  poke: {
    sig: 'poke( addr, [value,] [...] )',
    desc: 'Writes one or more bytes to contiguous memory locations.',
    params: [
      'addr: The address of the first memory location.',
      'value: The byte value to write to memory. Defaults to 0.',
      '...: Additional byte values to be written consecutively to memory.',
    ],
  },
  self: {},
  cartdata: {
    sig: 'cartdata( id )',
    desc: 'Sets up cartridge data for the cart.',
    params: [
      'id: A string that is likely to be unique across all PICO-8 carts.',
    ],
  },
  music: {
    sig: '',
    desc: 'Plays a music pattern, or stops playing.',
    params: [
      'n: The pattern number to start playing (0-63), or -1 to stop playing music.',
      'fadems: If not 0, fade in (or out) the music volume over a duration, given as a number of milliseconds.',
      'channelmask: A bitfield indicating which of the four sound channels should be reserved for music. The default is 0 (no channels reserved).',
    ],
  },
  coyield: {},
  costatus: {
    sig: 'costatus( cor )',
    desc: 'Tests a coroutine and returns a string representing its status.',
    params: [ 'cor: The coroutine to test.' ],
  },
  shl: {
    sig: 'shl( num, bits )',
    desc: 'Shifts the bits of a number to the left.',
    params: [ 'num: The number.', 'bits: The number of bits to shift.' ],
    deprecated: true,
  },
  add: {
    sig: 'add( table, value, [index] )',
    desc: 'Adds a element to the end of a sequence in a table.',
    params: [
      'table: The table.',
      'value: The value to add.',
      'index: The index for the value to be inserted.',
      'return-value: The value that was passed in.',
    ],
  },
  rotl: {
    sig: 'rotl( num, bits )',
    desc: 'Rotates the bits of a number to the left.',
    params: [ 'num: The number.', 'bits: The number of bits to rotate.' ],
    deprecated: true,
  },
  del: {
    sig: 'del( table, value )',
    desc: 'Deletes the first occurrence of a value from a sequence in a table.',
    params: [ 'table: The table.', 'value: The value to match and remove.' ],
  },
  cocreate: {
    sig: 'cocreate( func )',
    desc: 'Creates a coroutine from a function.',
    params: [
      'func: The function for the coroutine to run.',
      'return-value: A new coroutine.',
    ],
  },
  sgn: {
    sig: 'sgn( [number] )',
    desc: 'Returns the sign of a number, 1 for positive, -1 for negative',
    params: [ 'number: The number to determine the sign of.' ],
  },
  max: {
    sig: 'max( first, [second] )',
    desc: 'Returns the maximum of two numbers.',
    params: [
      'first: The first number.',
      'second: The second number. (default 0)',
    ],
  },
  bor: {
    sig: 'bor( first, second )',
    desc: 'Calculates the bitwise-or of two numbers.',
    params: [
      'first: The first number.',
      'second: The second number.',
      'return-value: The bitwise-or of first and second.',
    ],
    deprecated: true,
  },
  rotr: {
    sig: 'rotr( num, bits )',
    desc: 'Rotates the bits of a number to the right.',
    params: [ 'num: The number.', 'bits: The number of bits to rotate.' ],
    deprecated: true,
  },
  shr: {
    sig: 'shr( num, bits )',
    desc: 'Shifts the bits of a number to the right.',
    params: [ 'num: The number.', 'bits: The number of bits to shift.' ],
    deprecated: true,
  },
  assert: {
    sig: 'assert( cond, [message] )',
    desc: 'Causes a runtime error if a conditional expression is false.',
    params: [
      'cond: The conditional expression to assert.',
      'message: A message to print when the assertion fails.',
      'return-value: All arguments as passed to assert() in a tuple (if the assert didn\'t fail).',
    ],
  },
  rawget: {
    sig: 'rawget( tbl, member )',
    desc: 'Read a table member, bypassing metamethods',
    params: [
      'tbl: The table whose member to read.',
      'member: The member to read.',
    ],
  },
  reload: {
    sig: 'reload( destaddr, sourceaddr, len, [filename] )',
    desc: 'Loads a region of data from the cartridge, or from another cartridge, into memory.',
    params: [
      'destaddr: The address of the first byte of the destination in memory.',
      'sourceaddr: The address of the first byte in the cartridge data.',
      'len: The length of the memory region to copy, as a number of bytes.',
      'filename: If specified, the filename of a cartridge from which to read data. The default is to read from the currently loaded cartridge.',
    ],
  },
  tonum: {
    sig: 'tonum( str )',
    desc: 'Converts a string representation of a decimal, hexadecimal, or binary number to a number value.',
    params: [ 'str: The string.' ],
  },
  rawlen: {
    sig: 'rawlen( tbl )',
    desc: 'Get the length of a table, bypassing metamethods',
    params: [ 'tbl: The table whose length to retrieve.' ],
  },
  btnp: {
    sig: 'btnp( [i,] [p] )',
    desc: 'Tests if a button has just been pressed, with keyboard-style repeating.',
    params: [
      'i: The button number.',
      'p: The player number.',
      'return-value: If a button is specified, then true or false, otherwise a bitfield for multiple players.',
    ],
  },
  chr: {
    sig: 'New in PICO-8 0.2.0.',
    desc: 'Gets the character(s) corresponding to an ordinal(s) (numeric) value.',
    params: [
      'ord [, ord1, ordn]: The ordinal value to be converted to a single-character string. Accepts an array of ordinals and will return a string of characters',
      'return-value: A string consisting of a single character corresponding to the given ordinal number or a string of characters if an array was provided',
    ],
  },
  rawset: {
    sig: 'rawset( tbl, member, value )',
    desc: 'Write to a table member, bypassing metamethods',
    params: [
      'tbl: The table whose member to modify.',
      'member: The member to modify.',
      'value: The member\'s new value.',
    ],
  },
  cstore: {
    sig: 'cstore( destaddr, sourceaddr, len, [filename] )',
    desc: 'Store a region of memory in the cartridge file, or another cartridge file.',
    params: [
      'destaddr: The address of the first byte of the destination in the cartridge.',
      'sourceaddr: The address of the first byte in memory to copy.',
      'len: The length of the memory region to copy, as a number of bytes.',
      'filename: If specified, the filename of a cartridge to which data is written. The default is to write to the currently loaded cartridge.',
    ],
  },
  dset: {
    sig: 'dset( index, value )',
    desc: 'Sets a value in persistent cartridge data.',
    params: [ 'index: The index of the value.', 'value: The new value to set.' ],
  },
  type: {
    sig: 'type( value )',
    desc: 'Returns the basic type of a given value as a string.',
    params: [ 'value: The value whose type to test.' ],
  },
  coresume: {
    sig: 'coresume( cor, [...] )',
    desc: 'Starts a coroutine, or resumes a suspended coroutine.',
    params: [
      'cor: The coroutine, as created by cocreate().',
      '...: The arguments to pass to the coroutine\'s function or the coroutine\'s subsequent yields.',
      'return-values: A boolean indicating whether or not the coroutine is alive. On death, there may be a second value with an exception string.',
    ],
  },
  bxor: {
    sig: 'bxor( first, second )',
    desc: 'Calculates the bitwise-xor (exclusive or) of two numbers.',
    params: [
      'first: The first number.',
      'second: The second number.',
      'return-value: The bitwise-xor of first and second.',
    ],
    deprecated: true,
  },
  ord: {
    sig: 'ord( str, [index] )',
    desc: 'Gets the ordinal (numeric) version of a character in a string.',
    params: [
      'str: The string whose character is to be converted to an ordinal.',
      'index: The index of the character in the string. Default is 1, the first character.',
      'return-value: The ordinal value of the character at index in str',
    ],
  },
  tostr: {
    sig: 'tostr( val, [usehex] )',
    desc: 'Converts a non-string value to a string representation.',
    params: [
      'val: The value to convert.',
      'usehex: If true, uses 32-bit unsigned fixed point hexadecimal notation for number values. The default is to use concise decimal notation for number values.',
    ],
  },
  menuitem: {
    sig: 'menuitem( index, [label,] [callback] )',
    desc: 'Adds a custom item to the PICO-8 menu.',
    params: [
      'index: The item index, a number between 1 and 5.',
      'label: The label text of the menu item to add or change.',
      'callback: A Lua function to call when the user selects this menu item.',
    ],
  },
  poke4: {
    sig: 'poke4( addr, [...] )',
    desc: 'Writes one or more 32-bit fixed-point PICO-8 number values to contiguous groups of four consecutive memory locations.',
    params: [
      'addr: The address of the first memory location.',
      '...: The 32-bit values to write to memory. If these are omitted, a zero is written to the first 4 bytes.',
    ],
  },
  poke2: {
    sig: 'poke2( addr, [...] )',
    desc: 'Writes one or more 16-bit values to contiguous groups of two consecutive memory locations.',
    params: [
      'addr: The address of the first memory location.',
      '...: The 16-bit values to write to memory. If these are omitted, a zero is written to the first 2 bytes.',
    ],
  },
  peek2: {
    sig: 'peek2( addr, [n] )',
    desc: 'Reads one or more 16-bit values from contiguous groups of two consecutive memory locations.',
    params: [
      'addr: The address of the first memory location.',
      'n: The number of values to return. (1 by default, 8192 max.)',
    ],
  },
  peek4: {
    sig: 'peek4( addr, [n] )',
    desc: 'Reads one or more 32-bit fixed-point number values from contiguous groups of four consecutive memory locations.',
    params: [
      'addr: The address of the first memory location.',
      'n: The number of values to return. (1 by default, 8192 max.)',
    ],
  },
  stat: {
    sig: 'stat( n )',
    desc: 'Returns information about the current runtime environment.',
    params: [
      'n: The ID of the information to return.',
    ],
  },
  t: {
    sig: 't( )',
    desc: 'Returns the amount of time since PICO-8 was last started, as a (fractional) number of seconds.',
  },
  time: {
    sig: 'time( )',
    desc: 'Returns the amount of time since PICO-8 was last started, as a (fractional) number of seconds.',
  },
  extcmd: {
    sig: 'extcmd( cmd )',
    desc: 'Executes an administrative command from within a program.',
    params: [
      '\'label\': Sets the cart label to the current screen.',
      '\'screen\': Saves a screenshot.',
      '\'rec\': Sets the video recording start point.',
      '\'video\': Saves an animated GIF to the desktop.',
      '\'audio_rec\': Starts audio recording.',
      '\'audio_end\': Ends audio recording and saves to the desktop.',
      '\'pause\': Activates the pause menu, as if the player pressed the pause button.',
      '\'reset\': Resets the currently running cart, as if the player pressed the reset key sequence (Control-R or Command-R).',
      '\'breadcrumb\': After a cart uses load() with the breadcrumb parameter to load another cart, loads the original cart, as if the player selected the breadcrumb menu item.',
      '\'shutdown\': Exits the program if used in an exported binary.',
      '\'set_filename\': Set the filename of the next screenshot or gif.',
      '\'set_title\': set window title (useful for exported binaries)',
      '\'folder\': opens the folder where carts are. Nice if you want to open to a created file or what have you.',
    ],
  },
  serial: {
    sig: 'serial( channel, address, length)',
    desc: 'Buffers and dispatches GPIO writes at the end of each frame, allowing clock cycling at higher and/or more regular speeds than is possible by manually bit-banging using poke() calls.',
    params: [
      'channel: the channel to fread from/write to',
      'address: the PICO-8 memory location to read from/write to.',
      'length: number of bytes to send. 1/8ths are allowed to send partial bit strings.',
    ],
  },
  select: {
    sig: 'select( index, ... )',
    desc: 'Selects from the given parameters.',
    params: [
      'index: Index to return parameters from, or \'#\' to return number of parameters',
      '...: parameters',
    ],
  },
  yield: {
    sig: 'yield( [...] )',
    desc: 'Yields control back to the caller from within a coroutine.',
    params: [
      '...: Arguments to be passed to the coresume() that resumed its coroutine.',
    ],
  },
  stop: {
    sig: 'stop( [message,] [x,] [y,] [col] )',
    desc: 'Stops the program\'s execution and returns to the command prompt.',
    params: [
      'message: An optional message to print before stopping.',
      'x: The x coordinate of the upper left corner to start printing.',
      'y: The y coordinate of the upper left corner to start printing.',
      'col: The color to use for the text.',
    ],
  },
  trace: {
    sig: 'trace( [coroutine,] [message,] [skip] )',
    desc: 'Returns a description of the current call stack as a string.',
    params: [
      'coroutine: Optionally get the stack trace for a coroutine. Defaults to the current one or the main thread.',
      'message: Adds the given string to the top of the trace report. Defaults to blank.',
      'skip: Number of levels of the stack to skip. Defaults to 1, to skip the trace() call\'s own level.',
    ],
  },
  run: {
    sig: 'run( [str] )',
    desc: 'Runs the current cartridge from the start of the program.',
    params: [
      'str: A "breadcrumb" string, as if passed by a calling cartridge.',
    ],
  },
};
// Add 'mapdraw' alias for older version of 'map' function
Builtins.mapdraw = Builtins.map;
// Add ? as alias of print function
Builtins['?'] = Builtins.print;

// The symbols you get by typing shift+A, etc all the way to shift+Z
export const BuiltinConstants: Set<string> = new Set<string>([
  '_ENV',
  '█',
  '▒',
  '🐱',
  '⬇️',
  '░',
  '✽',
  '●',
  '♥',
  '☉',
  '웃',
  '⌂',
  '⬅️',
  '😐',
  '♪',
  '🅾️',
  '◆',
  '…',
  '➡️',
  '★',
  '⧗',
  '⬆️',
  'ˇ',
  '∧',
  '❎',
  '▤',
  '▥',
]);
