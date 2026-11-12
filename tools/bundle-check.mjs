#!/usr/bin/env node
/**
 * Fails when the exported iOS JS bundle is larger than the budget in tools/bundle-budget.json.
 *
 * Usage: node tools/bundle-check.mjs [exportDir]   (default exportDir: dist)
 * Run `npx expo export --platform ios --output-dir <exportDir>` first, or use `npm run bundle:check`.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exportDir = path.resolve(root, process.argv[2] ?? 'dist');
const bundleDir = path.join(exportDir, '_expo', 'static', 'js', 'ios');

const budget = JSON.parse(await readFile(path.join(root, 'tools', 'bundle-budget.json'), 'utf8'));
const maxBytes = budget.ios?.maxBytes;
if (typeof maxBytes !== 'number') {
  console.error('tools/bundle-budget.json is missing ios.maxBytes');
  process.exit(1);
}

let files;
try {
  files = (await readdir(bundleDir)).filter((f) => f.endsWith('.hbc') || f.endsWith('.js'));
} catch {
  console.error(`No iOS bundle found in ${path.relative(root, bundleDir)}. Run expo export first.`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`No iOS bundle files in ${path.relative(root, bundleDir)}.`);
  process.exit(1);
}

// The entry bundle is the largest file; async chunks (if any) are reported but not budgeted.
const sized = await Promise.all(
  files.map(async (file) => ({ file, bytes: (await stat(path.join(bundleDir, file))).size })),
);
sized.sort((a, b) => b.bytes - a.bytes);
const [main] = sized;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const used = ((main.bytes / maxBytes) * 100).toFixed(1);
console.log(`iOS bundle ${main.file}: ${mb(main.bytes)} of ${mb(maxBytes)} budget (${used}%)`);
for (const extra of sized.slice(1)) console.log(`  chunk ${extra.file}: ${mb(extra.bytes)}`);

if (main.bytes > maxBytes) {
  console.error(
    `Bundle exceeds budget by ${mb(main.bytes - maxBytes)}. Trim imports or justify a new budget.`,
  );
  process.exit(1);
}
