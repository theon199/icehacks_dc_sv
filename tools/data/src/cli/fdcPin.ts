/**
 * Curation helper: rewrites `fdc: [0, '<exact FDC description>']` placeholders in the knowledge
 * tables with the matching fdc_id (SR Legacy preferred, then Foundation). Descriptions that do not
 * match exactly are listed with the closest candidates so they can be fixed by hand.
 *
 *   npm run fdc:pin
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../paths.ts';
import { loadFdcDescriptions } from '../sources/fdc.ts';

const KNOWLEDGE_DIR = join(PACKAGE_ROOT, 'src', 'knowledge');
const PLACEHOLDER = /fdc: \[0, '((?:[^'\\]|\\.)*)'\]/g;

async function main(): Promise<void> {
  const foods = await loadFdcDescriptions();
  const byDescription = new Map<string, number>();
  for (const food of [...foods].sort((a, b) => (a.dataType === 'sr_legacy_food' ? -1 : 1) - (b.dataType === 'sr_legacy_food' ? -1 : 1))) {
    if (!byDescription.has(food.description)) byDescription.set(food.description, food.fdcId);
  }
  const missing: string[] = [];
  for (const file of (await readdir(KNOWLEDGE_DIR)).filter((f) => f.endsWith('.ts'))) {
    const path = join(KNOWLEDGE_DIR, file);
    const source = await readFile(path, 'utf8');
    const updated = source.replace(PLACEHOLDER, (whole, escaped: string) => {
      const description = escaped.replace(/\\'/g, "'");
      const id = byDescription.get(description);
      if (id === undefined) {
        missing.push(`${file}: ${description}`);
        return whole;
      }
      return `fdc: [${id}, '${escaped}']`;
    });
    if (updated !== source) await writeFile(path, updated);
  }
  if (missing.length > 0) {
    console.log(`Unresolved descriptions (${missing.length}):`);
    for (const line of missing) console.log(`  ${line}`);
    process.exitCode = 1;
  } else {
    console.log('All FDC placeholders resolved.');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
