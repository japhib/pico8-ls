/* eslint-disable @typescript-eslint/no-unsafe-call */
import * as fs from 'fs';
import Parser from './parser/parser';

// const input: string = fs.readFileSync('testfiles/low.p8').toString();
const input = `
if (g_debug) return
g_game.hp-=1
`;

const parser = new Parser(input);
console.log(JSON.stringify(parser.parseChunk()));
