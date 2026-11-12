/**
 * Helper for curating the ingredient knowledge base: searches cached FDC food descriptions.
 *
 *   npm run fdc:lookup -- "onions raw" "chickpeas canned"
 *   npm run fdc:lookup -- --id 170000
 */
import { loadFdcDescriptions, loadFdcFoods } from '../sources/fdc.ts';

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--id') {
    const ids = new Set(args.slice(1).map(Number));
    const foods = await loadFdcFoods(ids);
    for (const food of foods.values()) {
      console.log(`${food.fdcId} ${food.dataType} ${food.description}`);
      console.log(`  kcal=${food.nutrients.get(1008) ?? food.nutrients.get(2047)} portions=${food.portions.map((p) => `${p.amount} ${p.label}=${p.grams}g`).join('; ')}`);
    }
    return;
  }
  const foods = await loadFdcDescriptions();
  for (const query of args) {
    const q = tokens(query);
    const scored = foods
      .map((food) => {
        const d = tokens(food.description);
        const hits = q.filter((t) => d.some((w) => w === t || w === `${t}s` || `${w}s` === t)).length;
        const score = hits / q.length - d.length * 0.01 + (food.dataType === 'sr_legacy_food' ? 0.001 : 0);
        return { food, score, hits };
      })
      .filter((s) => s.hits === q.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    console.log(`# ${query}`);
    for (const { food } of scored) console.log(`  ${food.fdcId}\t${food.dataType === 'sr_legacy_food' ? 'SR' : 'FF'}\t${food.description}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
