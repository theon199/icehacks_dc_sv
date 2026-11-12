import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse';
import { unzipSync } from 'fflate';
import { cachePath } from '../paths.ts';
import { cachedDownload, fileExists, writeAtomic } from '../net/http.ts';

/**
 * Pinned USDA FoodData Central releases. Pinning keeps builds reproducible; bump deliberately.
 * The Foundation release is the newest one whose CSV bundle contains the food/nutrient/portion
 * tables (some later bundles ship sample tables only).
 */
export const FDC_DATASETS = [
  { key: 'standard_reference', zip: 'FoodData_Central_sr_legacy_food_csv_2018-04.zip', dataType: 'sr_legacy_food' },
  { key: 'foundation', zip: 'FoodData_Central_foundation_food_csv_2026-04-30.zip', dataType: 'foundation_food' },
] as const;
const DOWNLOAD_BASE = 'https://fdc.nal.usda.gov/fdc-datasets/';
const TABLES = ['food.csv', 'food_nutrient.csv', 'nutrient.csv', 'food_portion.csv', 'measure_unit.csv'] as const;

export async function fetchFdc(log: (message: string) => void): Promise<void> {
  for (const dataset of FDC_DATASETS) {
    const zipPath = cachePath('fdc', 'zips', dataset.zip);
    if (await cachedDownload(`${DOWNLOAD_BASE}${dataset.zip}`, zipPath)) log(`FDC: downloaded ${dataset.zip}`);
    const allPresent = await Promise.all(TABLES.map((t) => fileExists(cachePath('fdc', dataset.key, t))));
    if (allPresent.every(Boolean)) continue;
    const files = unzipSync(new Uint8Array(await readFile(zipPath)), {
      filter: (file) => TABLES.some((t) => file.name.endsWith(`/${t}`) || file.name === t),
    });
    for (const table of TABLES) {
      const entry = Object.entries(files).find(([name]) => name.endsWith(`/${table}`) || name === table);
      if (!entry) throw new Error(`FDC bundle ${dataset.zip} has no ${table}`);
      await writeAtomic(cachePath('fdc', dataset.key, table), entry[1]);
    }
    log(`FDC: extracted ${TABLES.length} tables from ${dataset.zip}`);
  }
}

async function* rows(path: string): AsyncGenerator<Record<string, string>> {
  const parser = createReadStream(path).pipe(parse({ columns: true, bom: true, relax_column_count: true }));
  for await (const record of parser) yield record as Record<string, string>;
}

export interface FdcFood {
  fdcId: number;
  dataType: string;
  description: string;
  /** Nutrient amounts per 100 g keyed by FDC nutrient id. */
  nutrients: Map<number, number>;
  portions: FdcPortion[];
}

export interface FdcPortion {
  amount: number;
  /** Lower-cased unit/description, e.g. "cup, chopped", "tbsp", "large". */
  label: string;
  grams: number;
}

export async function loadFdcDescriptions(): Promise<Array<{ fdcId: number; dataType: string; description: string }>> {
  const out: Array<{ fdcId: number; dataType: string; description: string }> = [];
  for (const dataset of FDC_DATASETS) {
    const path = cachePath('fdc', dataset.key, 'food.csv');
    if (!(await fileExists(path))) throw new Error(`Missing ${path}. Run "npm run fetch" first.`);
    for await (const row of rows(path)) {
      if (row.data_type !== dataset.dataType) continue;
      out.push({ fdcId: Number(row.fdc_id), dataType: dataset.dataType, description: row.description ?? '' });
    }
  }
  return out;
}

/** Loads nutrients + portions for just the requested foods (streams the large CSVs). */
export async function loadFdcFoods(ids: ReadonlySet<number>): Promise<Map<number, FdcFood>> {
  const foods = new Map<number, FdcFood>();
  for (const dataset of FDC_DATASETS) {
    const dir = (t: string) => cachePath('fdc', dataset.key, t);
    for (const t of TABLES) {
      if (!(await fileExists(dir(t)))) throw new Error(`Missing ${dir(t)}. Run "npm run fetch" first.`);
    }
    for await (const row of rows(dir('food.csv'))) {
      const id = Number(row.fdc_id);
      if (!ids.has(id) || row.data_type !== dataset.dataType) continue;
      foods.set(id, { fdcId: id, dataType: dataset.dataType, description: row.description ?? '', nutrients: new Map(), portions: [] });
    }
    const units = new Map<string, string>();
    for await (const row of rows(dir('measure_unit.csv'))) units.set(row.id ?? '', (row.name ?? '').toLowerCase());
    for await (const row of rows(dir('food_nutrient.csv'))) {
      const food = foods.get(Number(row.fdc_id));
      if (!food || row.amount === undefined || row.amount === '') continue;
      const amount = Number(row.amount);
      if (Number.isFinite(amount)) food.nutrients.set(Number(row.nutrient_id), amount);
    }
    for await (const row of rows(dir('food_portion.csv'))) {
      const food = foods.get(Number(row.fdc_id));
      if (!food) continue;
      const grams = Number(row.gram_weight);
      const amount = Number(row.amount || '1') || 1;
      const unit = units.get(row.measure_unit_id ?? '') ?? '';
      const parts = [unit === 'undetermined' ? '' : unit, row.portion_description ?? '', row.modifier ?? '']
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
      if (grams > 0 && parts.length > 0) food.portions.push({ amount, label: parts.join(' '), grams });
    }
  }
  return foods;
}
