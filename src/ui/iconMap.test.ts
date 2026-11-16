/// <reference types="node" />
/**
 * Guards the icon table: every SF Symbol name the app draws through `Icon` (directly, or through
 * a control's `icon` prop or an `IconName` constant) has an Ionicons glyph, and every glyph in the
 * table exists in the bundled font. A new icon without a mapping would quietly render as an SF
 * Symbol beside Ionicons glyphs.
 */
import fs from 'node:fs';
import path from 'node:path';

import { iconMap } from './iconMap';

const srcDir = path.join(__dirname, '..');
const repoRoot = path.join(srcDir, '..');

/** Every SF Symbol name, from the type package `expo-symbols` is built on. */
function sfSymbolNames(): Set<string> {
  const dts = fs.readFileSync(
    path.join(repoRoot, 'node_modules', 'sf-symbols-typescript', 'dist', 'index.d.ts'),
    'utf8',
  );
  return new Set([...dts.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? ''));
}

/**
 * String literals that happen to be valid SF Symbol names but are never icons: style values,
 * roles, union tags and token names that live in the same files as icons.
 */
const NOT_ICONS = new Set([
  'allergens',
  'bold',
  'clear',
  'display',
  'eyebrow',
  'info',
  'italic',
  'left',
  'link',
  'network',
  'note',
  'number',
  'paragraph',
  'pill',
  'radio',
  'right',
  'target',
  'underline',
]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__fixtures__' ? [] : sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

/** SF names written as string literals in files that draw icons. */
function iconNamesUsedInSrc(): Map<string, string> {
  const symbols = sfSymbolNames();
  const used = new Map<string, string>();
  for (const file of sourceFiles(srcDir)) {
    if (file.endsWith(`${path.sep}iconMap.ts`)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!/\b(Icon|IconName|IconButton|icon)\b/.test(text)) continue;
    for (const match of text.matchAll(/'([a-z0-9.]+)'|"([a-z0-9.]+)"/g)) {
      const name = match[1] ?? match[2] ?? '';
      if (symbols.has(name) && !NOT_ICONS.has(name) && !used.has(name)) {
        used.set(name, path.relative(srcDir, file));
      }
    }
  }
  return used;
}

describe('iconMap', () => {
  const used = iconNamesUsedInSrc();

  it('finds the icons the app draws', () => {
    expect(used.size).toBeGreaterThan(50);
    expect(used.has('person')).toBe(true);
  });

  it.each([...used.entries()])('maps %s (used in %s) to an Ionicons glyph', (name) => {
    expect(Object.keys(iconMap)).toContain(name);
  });

  it('only names glyphs the Ionicons font has', () => {
    const glyphs: Record<string, number> = JSON.parse(
      fs.readFileSync(
        path.join(
          repoRoot,
          'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
        ),
        'utf8',
      ),
    );
    const missing = Object.values(iconMap).filter((glyph) => !(glyph in glyphs));
    expect(missing).toEqual([]);
  });

  it('uses the header glyphs the design calls for', () => {
    expect(iconMap.person).toBe('person-outline');
    expect(iconMap.cart).toBe('cart-outline');
    expect(iconMap.gearshape).toBe('settings-outline');
    expect(iconMap.bell).toBe('notifications-outline');
    expect(iconMap['slider.horizontal.3']).toBe('options-outline');
    expect(iconMap.plus).toBe('add');
    expect(iconMap['chevron.left']).toBe('chevron-back');
    expect(iconMap.bookmark).toBe('bookmark-outline');
    expect(iconMap.magnifyingglass).toBe('search');
  });
});
