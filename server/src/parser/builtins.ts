// A list of all the built-in functions of PICO-8
export default {
  // graphics
  camera: { sig: '([x,] [y])' },
  circ: { sig: '(x, y, r, [col])' },
  circfill: { sig: '(x, y, r, [col])' },
  clip: { sig: '([x,] [y,] [w,] [h])' },
  cls: { sig: '()' },
  color: { sig: '(col)' },
  cursor: { sig: '([x,] [y,] [col])' },
  fget: { sig: '(n, [f])' },
  fillp: { sig: '([pat])' },
  flip: {},
  fset: { sig: '(n, [f,] [v])' },
  line: { sig: '(x0, y0, x1, y1, [col])' },
  oval: { sig: '(x0, y0, x1, y1, [col])' },
  ovalfill: { sig: '(x0, y0, x1, y1, [col])' },
  pal: { sig: '([c0,] [c1,] [p])' },
  palt: { sig: '([c,] [t])' },
  pget: { sig: '(x, y)' },
  print: { sig: '(str, [x,] [y,] [col])' },
  pset: { sig: '(x, y, [c])' },
  rect: { sig: '(x0, y0, x1, y1, [col])' },
  rectfill: { sig: '(x0, y0, x1, y1, [col])' },
  sget: { sig: '(x, y)' },
  spr: { sig: '(n, x, y, [w,] [h,] [flip_x,] [flip_y])' },
  sset: { sig: '(x, y, [c])' },
  sspr: { sig: '(sx, sy, sw, sh, dx, dy, [dw,] [dh,] [flip_x,] [flip_y])' },
  tline: { sig: '(x0, y0, x1, y1, mx, my, [mdx,] [mdy])' },

  // tables
  add: { sig: '(t, v)' },
  all: { sig: '(t)' },
  count: { sig: '(t, [v])' },
  del: { sig: '(t, v)' },
  deli: { sig: '(t, i)' },
  foreach: { sig: '(t, f)' },
  getmetatable: { sig: '(tbl)' },
  ipairs: { sig: '(t)' },
  pairs: { sig: '(t)' },
  next: { sig: '(t, [key])' },
  setmetatable: { sig: '(tbl, metatbl)' },

  // input
  btn: { sig: '([i,] [p])' },
  btnp: { sig: '([i,] [p])' },

  // sound
  music: { sig: '([n,] [fade_len,] [channel_mask])' },
  sfx: { sig: '(n, [channel,] [offset])' },

  // map
  map: { sig: '(cel_x, cel_y, sx, sy, cel_w, cel_h, [layer])' },
  mget: { sig: '(x, y)' },
  mset: { sig: '(x, y, v)' },

  // memory
  memcpy: { sig: '(dest_addr, source_addr, len)' },
  memset: { sig: '(dest_addr, val, len)' },
  peek: { sig: '(addr)' },
  poke: { sig: '(addr, val)' },

  // math
  abs: { sig: '(x)' },
  atan2: { sig: '(dx, dy)' },
  band: { sig: '(x, y)', deprecated: 'use & operator instead' },
  bnot: { sig: '(x)', deprecated: 'use ~ operator instead' },
  bor: { sig: '(x, y)', deprecated: 'use | operator instead' },
  bxor: { sig: '(x, y)', deprecated: 'use ^^ instead' },
  ceil: { sig: '(x)' },
  cos: { sig: '(x)' },
  flr: { sig: '(x)' },
  lshr: { sig: '(num, bits)' },
  max: { sig: '(x, y)' },
  mid: { sig: '(x, y, z)' },
  min: { sig: '(x, y)' },
  rnd: { sig: '(x)' },
  rotl: { sig: '(num, bits)' },
  rotr: { sig: '(num, bits)' },
  sgn: { sig: '(x)' },
  shl: { sig: '(x, y)' },
  shr: { sig: '(x, y)' },
  sin: { sig: '(x)' },
  sqrt: { sig: '(x)' },
  srand: { sig: '(x)' },

  // cartridge data
  cartdata: { sig: '(id)' },
  dget: { sig: '(index)' },
  dset: { sig: '(index, value)' },
  cstore: { sig: '(dest_addr, source_addr, len, [filename])' },
  reload: { sig: '(dest_addr, source_addr, len, [filename])' },

  // coroutines
  cocreate: {},
  coresume: {},
  costatus: {},
  coyield: {},

  // values and objects
  chr: { sig: '(num)' },
  ord: { sig: '(str, [index])' },
  rawequals: { sig: '(val1,val2)' },
  rawget: { sig: '(tbl, key)' },
  rawlen: { sig: '(tbl)' },
  rawset: { sig: '(tbl, key, val)' },
  split: { sig: '(str, [separator, ] [convert_numbers])' },
  sub: { sig: '(str, from, [to])' },
  tonum: { sig: '(str)' },
  tostr: { sig: '(val, [usehex])' },
  type: { sig: '(v)' },

  // misc built-in
  assert: {},
  unpack: {},
  pack: {},
  printh: {},
  self: {},
};
