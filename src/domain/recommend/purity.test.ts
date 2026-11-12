/**
 * Guards the layering rule from docs/ARCHITECTURE.md: code in src/domain is pure TypeScript. It
 * imports only other domain files and zod, never reads the clock or randomness directly, and never
 * touches the network.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DOMAIN_ROOT = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const ALLOWED_PACKAGES = new Set(['zod']);
const FORBIDDEN_CALLS: readonly [RegExp, string][] = [
  [/\bDate\.now\s*\(/, 'Date.now() (inject `now` instead)'],
  [/\bnew Date\s*\(\s*\)/, 'new Date() without arguments (inject `now` instead)'],
  [/\bMath\.random\s*\(/, 'Math.random() (use a seeded source)'],
  [/\bfetch\s*\(/, 'fetch() (domain code has no network access)'],
  [/\bperformance\.now\s*\(/, 'performance.now()'],
];

describe('domain purity', () => {
  const files = sourceFiles(DOMAIN_ROOT);

  it('finds the domain sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => [relative(DOMAIN_ROOT, file), file]))(
    '%s imports only domain code and zod',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      const specifiers = [...source.matchAll(/\bfrom\s+'([^']+)'|\bimport\s*\(\s*'([^']+)'/g)].map(
        (match) => match[1] ?? match[2] ?? '',
      );
      for (const specifier of specifiers) {
        if (specifier.startsWith('.')) continue;
        expect(ALLOWED_PACKAGES).toContain(specifier);
      }
      expect(source).not.toMatch(/\brequire\s*\(/);
    },
  );

  it.each(files.map((file) => [relative(DOMAIN_ROOT, file), file]))(
    '%s has no hidden clock, randomness or network',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      for (const [pattern, label] of FORBIDDEN_CALLS) {
        if (pattern.test(source)) throw new Error(`${label} found in ${file}`);
      }
    },
  );
});
