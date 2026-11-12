/**
 * Builds assets/catalog/famara-catalog.db and manifest.json offline from tools/data/.cache.
 * Exits non-zero when any quality gate fails. Set SOURCE_DATE_EPOCH for a reproducible built_at.
 */
import { buildCatalog } from '../pipeline/build.ts';
import { REPORT_PATH } from '../paths.ts';

const log = (message: string) => console.log(`[build] ${message}`);

buildCatalog(log)
  .then((result) => {
    log(`quality gates: ${result.checks} checks, ${result.violations.length} violations`);
    if (result.violations.length > 0) {
      for (const v of result.violations.slice(0, 50)) console.error(`  ✗ ${v}`);
      if (result.violations.length > 50) console.error(`  … and ${result.violations.length - 50} more (see ${REPORT_PATH})`);
      process.exitCode = 1;
      return;
    }
    log(`wrote ${result.recipes} recipes, ${result.ingredients} ingredients, ${(result.bytes / 1024 / 1024).toFixed(2)} MB, sha256 ${result.sha256}`);
    log(`details: npm run report`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
