import { getTestFileContents, parse } from './test-utils';
import { strictEqual as eq } from 'assert';
import Formatter from '../formatter';

function format(text: string): string {
  const chunk = parse(text);
  const formatter = new Formatter();
  return formatter.formatChunk(chunk);
}

describe('Formatter', () => {
  it.only('formats low.p8', () => {
    const formatted = format(getTestFileContents('low.p8'));
    console.log(formatted);
  });
});
