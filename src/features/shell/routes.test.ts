/// <reference types="node" />
/**
 * Guards the route table: every screen configured in the `(app)` stack and every tab must have a
 * route file, so a rename never silently drops a screen's presentation options.
 */
import fs from 'node:fs';
import path from 'node:path';

import { appScreens } from './appScreens';
import { tabs } from './tabs';

const appDir = path.join(__dirname, '..', '..', 'app');

function routeExists(dir: string, name: string): boolean {
  const base = path.join(dir, name);
  return (
    fs.existsSync(`${base}.tsx`) ||
    fs.existsSync(path.join(base, '_layout.tsx')) ||
    fs.existsSync(path.join(base, 'index.tsx'))
  );
}

describe('app routes', () => {
  it.each(appScreens.map((s) => s.name))('%s has a route file', (name) => {
    expect(routeExists(path.join(appDir, '(app)'), name)).toBe(true);
  });

  it('has no duplicate screen names', () => {
    const names = appScreens.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(tabs.map((t) => t.name))('tab %s has a stack layout and index', (name) => {
    const dir = path.join(appDir, '(app)', '(tabs)', name);
    expect(fs.existsSync(path.join(dir, '_layout.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'index.tsx'))).toBe(true);
  });

  it('keeps route files thin', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
      });
    for (const file of walk(appDir)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n').length;
      expect({ file: path.relative(appDir, file), ok: lines <= 80 }).toEqual({
        file: path.relative(appDir, file),
        ok: true,
      });
    }
  });
});
