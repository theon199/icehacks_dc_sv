/**
 * Prints a quality report for the built catalog: coverage, distributions, unmatched lines,
 * withheld nutrition and lines whose weight could not be resolved.
 *
 *   npm run report             summary
 *   npm run report -- --full   also list every issue
 */
import { existsSync, readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { DB_PATH, MANIFEST_PATH, REPORT_PATH } from '../paths.ts';
import { ALLERGEN_IDS, DietFlag } from '../types.ts';

const reportSchema = z.object({
  sources: z.number(),
  recipes: z.number(),
  ingredient_lines: z.number(),
  matched_lines: z.number(),
  match_rate: z.number(),
  issues: z.array(z.object({ recipe_id: z.string(), kind: z.string(), detail: z.string() })),
  violations: z.array(z.string()),
});

const full = process.argv.includes('--full');
const pct = (n: number, d: number) => (d === 0 ? '0.0%' : `${((n / d) * 100).toFixed(1)}%`);

function table(title: string, rows: Array<{ key: string | number | null; n: number }>, total: number): void {
  console.log(`\n${title}`);
  for (const row of rows) console.log(`  ${String(row.key ?? '—').padEnd(24)} ${String(row.n).padStart(5)}  ${pct(row.n, total)}`);
}

function main(): void {
  if (!existsSync(DB_PATH) || !existsSync(REPORT_PATH)) {
    console.error('No build found. Run "npm run build" first.');
    process.exitCode = 1;
    return;
  }
  const report = reportSchema.parse(JSON.parse(readFileSync(REPORT_PATH, 'utf8')));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, unknown>;
  const db = new Database(DB_PATH, { readonly: true });
  const total = (db.prepare('SELECT count(*) AS n FROM recipes').get() as { n: number }).n;
  const all = <T>(sql: string) => db.prepare(sql).all() as T[];

  console.log('Famara catalog report');
  console.log(`  manifest: ${JSON.stringify(manifest)}`);
  console.log(`  recipes: ${total} of ${report.sources} source recipes`);
  console.log(`  ingredient lines matched: ${report.matched_lines}/${report.ingredient_lines} (${(report.match_rate * 100).toFixed(2)}%)`);
  console.log(`  quality gate violations: ${report.violations.length}`);

  table('By source', all<{ key: string; n: number }>("SELECT substr(id, 1, instr(id, ':') - 1) AS key, count(*) AS n FROM recipes GROUP BY key ORDER BY n DESC"), total);
  table('By course', all('SELECT course AS key, count(*) AS n FROM recipes GROUP BY course ORDER BY n DESC'), total);
  table('By region', all('SELECT region AS key, count(*) AS n FROM recipes GROUP BY region ORDER BY n DESC'), total);
  table('Top cuisines', all('SELECT cuisine AS key, count(*) AS n FROM recipes GROUP BY cuisine ORDER BY n DESC LIMIT 25'), total);
  table('Nutrition confidence', all('SELECT nutrition_confidence AS key, count(*) AS n FROM recipes GROUP BY key ORDER BY n DESC'), total);
  table('Effort', all('SELECT effort AS key, count(*) AS n FROM recipes GROUP BY effort ORDER BY effort'), total);
  table('Gentle', all('SELECT gentle AS key, count(*) AS n FROM recipes GROUP BY gentle'), total);

  const goals = all<{ goal_tags: string }>('SELECT goal_tags FROM recipes');
  const goalCounts = new Map<string, number>();
  for (const row of goals) for (const g of JSON.parse(row.goal_tags) as string[]) goalCounts.set(g, (goalCounts.get(g) ?? 0) + 1);
  table('Goal tags', [...goalCounts.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n), total);

  const diets = all<{ diet_flags: number }>('SELECT diet_flags FROM recipes');
  table(
    'Diet flags',
    Object.entries(DietFlag).map(([key, bit]) => ({ key, n: diets.filter((d) => (d.diet_flags & bit) !== 0).length })),
    total,
  );

  const allergens = all<{ allergens: string }>('SELECT allergens FROM recipes').map((r) => JSON.parse(r.allergens) as Record<string, string>);
  console.log('\nAllergen status (contains / free / unknown)');
  for (const a of ALLERGEN_IDS) {
    const count = (state: string) => allergens.filter((x) => x[a] === state).length;
    console.log(`  ${a.padEnd(10)} ${String(count('contains')).padStart(5)} ${String(count('free')).padStart(5)} ${String(count('unknown')).padStart(5)}`);
  }

  const stats = db
    .prepare(
      `SELECT round(avg(kcal)) AS kcal, round(min(kcal)) AS min_kcal, round(max(kcal)) AS max_kcal, round(avg(health_score), 3) AS score,
              round(avg(total_minutes)) AS minutes, round(avg(servings), 1) AS servings
       FROM recipes WHERE nutrition_confidence != 'none'`,
    )
    .get();
  console.log(`\nWith nutrition: ${JSON.stringify(stats)}`);

  const unresolved = all<{ text: string; n: number }>(
    `SELECT ri.text AS text, count(*) AS n FROM recipe_ingredients ri
     WHERE ri.quantity IS NOT NULL AND ri.grams IS NULL GROUP BY ri.text ORDER BY n DESC LIMIT ${full ? 1000 : 25}`,
  );
  table('Quantified lines without a weight', unresolved.map((r) => ({ key: r.text.slice(0, 24), n: r.n })), report.ingredient_lines);

  const byKind = new Map<string, number>();
  for (const issue of report.issues) byKind.set(issue.kind, (byKind.get(issue.kind) ?? 0) + 1);
  table('Build notes', [...byKind.entries()].map(([key, n]) => ({ key, n })), total);
  console.log('\nUnmatched ingredient lines');
  for (const issue of report.issues.filter((i) => i.kind === 'unmatched_line')) console.log(`  ${issue.recipe_id}: ${issue.detail}`);
  if (full) {
    console.log('\nAll notes');
    for (const issue of report.issues) console.log(`  [${issue.kind}] ${issue.recipe_id}: ${issue.detail}`);
  }
  for (const v of report.violations) console.log(`  ✗ ${v}`);
  db.close();
}

main();
