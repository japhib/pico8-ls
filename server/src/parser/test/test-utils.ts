import * as fs from 'fs';
import * as path from 'path';

export function getTestFileContents(filename: string): string {
  const filepath = path.join(__dirname, '../../../../testfiles/', filename);
  return fs.readFileSync(filepath).toString();
}
