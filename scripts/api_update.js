/* eslint-disable no-undef */
const https = require('https');
const { parse, HTMLElement } = require('node-html-parser');
const { decode } = require('he');
const { inspect } = require('util');

// Helper script for generating builtins.ts, the list of built-in functions in PICO-8 and their documentation.
// After running, you probably have to go through and fix some of the docs still.

const funcs = [
  // graphics
  'camera', 'circ', 'circfill', 'clip', 'cls', 'color', 'cursor', 'fget', 'fillp', 'flip', 'fset', 'line',
  'oval', 'ovalfill', 'pal', 'palt', 'pget', 'print', 'pset', 'rect', 'rectfill', 'sget', 'spr', 'sset', 'sspr', 'tline',

  // tables
  'add', 'all', 'count', 'del', 'deli', 'foreach', 'getmetatable', 'ipairs', 'pairs', 'next', 'setmetatable',

  // input
  'btn', 'btnp',

  // music/sound
  'music', 'sfx',

  // map
  'map', 'mget', 'mset',

  // memory
  'memcpy', 'memset', 'peek', 'poke',

  // math
  'abs', 'atan2', 'band', 'bnot', 'bor', 'bxor', 'ceil', 'cos', 'flr', 'lshr', 'max', 'mid', 'min', 'rnd',
  'rotl', 'rotr', 'sgn', 'shl', 'shr', 'sin', 'sqrt', 'srand',

  // cartridges
  'cartdata', 'dget', 'dset', 'cstore', 'reload',

  // coroutines
  'cocreate', 'coresume', 'costatus', 'coyield',

  // values and objects
  'chr', 'ord', 'rawequals', 'rawget', 'rawlen', 'rawset', 'split', 'sub', 'tonum', 'tostr', 'type',

  // misc built-in
  'assert', 'unpack', 'pack', 'printh', 'self',
];

async function requestWebPage(hostname, path) {
  const options = { hostname, path, port: 443, method: 'GET' };

  return new Promise((resolve, reject) => {
    const request = https.request(options, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(data));
    });

    request.on('error', err => reject(err));
    request.end();
  });
}

function findOneChildByFilter(element, filter) {
  if (!(element instanceof HTMLElement))
    throw new Error('!!');

  for (const child of element.childNodes) {
    if (!(child instanceof HTMLElement))
      continue;

    if (child.rawTagName === filter || child.id === filter || child.classList.contains(filter))
      return child;
  }

  return undefined;
}

function findAllChildrenByFilter(element, filter) {
  if (!(element instanceof HTMLElement))
    throw new Error('!!');

  const ret = [];
  for (const child of element.childNodes) {
    if (!(child instanceof HTMLElement))
      continue;

    if (child.rawTagName === filter || child.id === filter || child.classList.contains(filter))
      ret.push(child);
  }

  return ret;
}

function findChild(element, filters) {
  let current = element;
  for (const filter of filters) {
    const found = findOneChildByFilter(current, filter);
    if (!found)
      return current;

    current = found;
  }
  return current;
}

async function getInfoForFunction(func) {
  // convert first letter to uppercase
  const funcName = func[0].toUpperCase() + func.substring(1);

  const pageContents = parse(await requestWebPage('pico-8.fandom.com', '/wiki/' + funcName));
  const content = findChild(pageContents, ['html', 'body', 'main-container', 'resizable-container', 'has-right-rail', 'page__main', 'content', 'mw-content-text', 'mw-parser-output']);

  let functionSignature = decode(content.childNodes[0].innerText).trim();
  const deprecated = functionSignature.includes('Deprecated');
  if (deprecated || functionSignature.startsWith('New in PICO-8'))
    functionSignature = decode(content.childNodes[2].innerText).trim();

  const infos = findAllChildrenByFilter(content, 'dl').flatMap(dl => dl.childNodes).map(el => decode(el.innerText).trim()).filter(txt => txt !== '');
  // console.log(infos);

  const params = [];
  for (let i = 1; i+1 < infos.length; i += 2)
    params.push(`${infos[i]}: ${infos[i+1]}`);

  let infoObj = {
    sig: functionSignature,
    desc: infos[0],
    params,
  };
  if (deprecated) infoObj.deprecated = true;

  if (!infoObj.desc) infoObj = {};

  console.log(func + ': ' + inspect(infoObj) + ',');
}

(async function() {
  console.log(`// A list of all the built-in functions of PICO-8
export default {`);

  const all = [];
  for (const func of funcs) all.push(getInfoForFunction(func));
  await Promise.all(all);

  console.log('}');
})();
