import { readFileSync } from 'node:fs';
import path from 'node:path';

import { WORDMARK_ASPECT } from './Wordmark';

/** Reads width and height from a PNG's IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('Wordmark', () => {
  it('matches the aspect of the generated lettering', () => {
    const { width, height } = pngSize(
      path.join(__dirname, '..', '..', '..', 'assets', 'images', 'wordmark.png'),
    );
    expect(WORDMARK_ASPECT).toBeCloseTo(width / height, 5);
  });
});
