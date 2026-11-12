/**
 * Downloads every public source into tools/data/.cache. Safe to re-run: cached files are reused,
 * so an interrupted run resumes where it stopped.
 *
 *   npm run fetch                 all sources + tutorial link checks
 *   npm run fetch -- --skip-links  sources only
 *   npm run fetch -- --only=mealdb,medlineplus,fdc,links
 */
import { fetchFdc } from '../sources/fdc.ts';
import { checkTutorialLinks } from '../sources/links.ts';
import { fetchMealDb, mealToSource, readMealDbMeals } from '../sources/mealdb.ts';
import { fetchMedlinePlus, readMedlinePlusRecipes } from '../sources/medlineplus.ts';

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',');
const want = (step: string) => (only ? only.includes(step) : step !== 'links' || !args.includes('--skip-links'));
const log = (message: string) => console.log(`[fetch] ${message}`);

async function main(): Promise<void> {
  if (want('mealdb')) await fetchMealDb(log);
  if (want('medlineplus')) await fetchMedlinePlus(log);
  if (want('fdc')) await fetchFdc(log);
  if (want('links')) {
    const recipes = [...(await readMealDbMeals()).map(mealToSource), ...(await readMedlinePlusRecipes())];
    await checkTutorialLinks(
      recipes.flatMap((r) => r.tutorials),
      log,
    );
  }
  log('done');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
