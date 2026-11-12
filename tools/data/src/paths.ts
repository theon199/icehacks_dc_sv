import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

/** tools/data */
export const PACKAGE_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
export const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
export const CACHE_DIR = join(PACKAGE_ROOT, '.cache');
export const OUTPUT_DIR = join(REPO_ROOT, 'assets', 'catalog');
export const DB_PATH = join(OUTPUT_DIR, 'famara-catalog.db');
export const MANIFEST_PATH = join(OUTPUT_DIR, 'manifest.json');
export const REPORT_PATH = join(CACHE_DIR, 'build-report.json');

export const cachePath = (...parts: string[]) => join(CACHE_DIR, ...parts);
