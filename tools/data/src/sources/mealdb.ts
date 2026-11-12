import { readdir, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { cachePath, CACHE_DIR } from '../paths.ts';
import { fileExists, politeFetch, writeAtomic } from '../net/http.ts';
import type { SourceRecipe, SourceTutorial } from '../types.ts';

const API = 'https://www.themealdb.com/api/json/v1/1/';
const DIR = 'mealdb';

const nullableString = z
  .string()
  .nullish()
  .transform((value) => (value ?? '').trim());

const mealSchema = z
  .object({
    idMeal: z.string().regex(/^\d+$/),
    strMeal: z.string().min(1),
    strCategory: nullableString,
    strArea: nullableString,
    strInstructions: nullableString,
    strMealThumb: nullableString,
    strTags: nullableString,
    strYoutube: nullableString,
    strSource: nullableString,
  })
  .catchall(z.unknown());
export type MealDbMeal = z.infer<typeof mealSchema>;

const mealListSchema = z.object({ meals: z.array(mealSchema).nullable() });
const summaryListSchema = z.object({
  meals: z.array(z.object({ idMeal: z.string() }).catchall(z.unknown())).nullable(),
});
const categoryListSchema = z.object({ meals: z.array(z.object({ strCategory: z.string() })) });
const areaListSchema = z.object({ meals: z.array(z.object({ strArea: z.string() })) });

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

async function cachedJson(file: string, url: string): Promise<unknown> {
  const path = cachePath(DIR, file);
  if (!(await fileExists(path))) {
    const response = await politeFetch(url);
    const text = await response.text();
    JSON.parse(text);
    await writeAtomic(path, text);
  }
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const fileSafe = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * Enumerates every meal: first-letter search returns full records; category and area listings are
 * then used to find any id the letter search missed, which is fetched individually.
 */
export async function fetchMealDb(log: (message: string) => void): Promise<void> {
  const seen = new Set<string>();
  for (const letter of LETTERS) {
    const data = mealListSchema.parse(await cachedJson(`search-${letter}.json`, `${API}search.php?f=${letter}`));
    for (const meal of data.meals ?? []) seen.add(meal.idMeal);
  }
  log(`TheMealDB: ${seen.size} meals from letter search`);

  const categories = categoryListSchema.parse(await cachedJson('list-categories.json', `${API}list.php?c=list`));
  const areas = areaListSchema.parse(await cachedJson('list-areas.json', `${API}list.php?a=list`));
  const listed = new Set<string>();
  for (const { strCategory } of categories.meals) {
    const data = summaryListSchema.parse(
      await cachedJson(`filter-c-${fileSafe(strCategory)}.json`, `${API}filter.php?c=${encodeURIComponent(strCategory)}`),
    );
    for (const meal of data.meals ?? []) listed.add(meal.idMeal);
  }
  for (const { strArea } of areas.meals) {
    const data = summaryListSchema.parse(
      await cachedJson(`filter-a-${fileSafe(strArea)}.json`, `${API}filter.php?a=${encodeURIComponent(strArea)}`),
    );
    for (const meal of data.meals ?? []) listed.add(meal.idMeal);
  }
  const missing = [...listed].filter((id) => !seen.has(id)).sort();
  for (const id of missing) {
    await cachedJson(`lookup-${id}.json`, `${API}lookup.php?i=${id}`);
  }
  log(`TheMealDB: ${missing.length} extra meals fetched by id (${listed.size} listed via categories/areas)`);
}

/** Reads every cached meal record, de-duplicated by id. */
export async function readMealDbMeals(): Promise<MealDbMeal[]> {
  const dir = cachePath(DIR);
  const files = (await readdir(dir)).filter((f) => /^(search-[a-z]|lookup-\d+)\.json$/.test(f)).sort();
  if (files.length === 0) throw new Error(`No TheMealDB cache in ${CACHE_DIR}. Run "npm run fetch" first.`);
  const byId = new Map<string, MealDbMeal>();
  for (const file of files) {
    const data = mealListSchema.parse(JSON.parse(await readFile(cachePath(DIR, file), 'utf8')));
    for (const meal of data.meals ?? []) byId.set(meal.idMeal, meal);
  }
  return [...byId.values()].sort((a, b) => Number(a.idMeal) - Number(b.idMeal));
}

function field(meal: MealDbMeal, key: string): string {
  const value = meal[key];
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

export function youtubeId(value: string): string | null {
  if (!isHttpUrl(value)) return null;
  const url = new URL(value);
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtube.com') id = url.searchParams.get('v');
  else if (host === 'youtu.be') id = url.pathname.slice(1);
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function mealToSource(meal: MealDbMeal): SourceRecipe {
  const lines: SourceRecipe['lines'] = [];
  for (let i = 1; i <= 20; i++) {
    const name = field(meal, `strIngredient${i}`);
    if (!name) continue;
    const measure = field(meal, `strMeasure${i}`);
    lines.push({ text: measure ? `${measure} ${name}` : name, name, measure });
  }

  const tutorials: SourceTutorial[] = [];
  const videoId = youtubeId(meal.strYoutube);
  if (videoId) {
    tutorials.push({ kind: 'video', url: `https://www.youtube.com/watch?v=${videoId}`, title: null, publisher: 'YouTube' });
  }
  if (isHttpUrl(meal.strSource)) {
    tutorials.push({
      kind: 'web',
      url: meal.strSource,
      title: null,
      publisher: new URL(meal.strSource).hostname.replace(/^www\./, ''),
    });
  }

  const area = meal.strArea && meal.strArea.toLowerCase() !== 'unknown' ? meal.strArea : null;
  return {
    id: `mealdb:${meal.idMeal}`,
    source: 'mealdb',
    sourceId: meal.idMeal,
    title: meal.strMeal.replace(/\s+/g, ' ').trim(),
    categories: meal.strCategory ? [meal.strCategory] : [],
    area,
    tags: meal.strTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    lines,
    instructions: meal.strInstructions ? [meal.strInstructions] : [],
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    imageUrl: isHttpUrl(meal.strMealThumb) ? meal.strMealThumb.replace(/^http:/, 'https:') : null,
    imageCredit: isHttpUrl(meal.strMealThumb) ? 'TheMealDB' : null,
    sourceName: 'TheMealDB',
    sourceUrl: `https://www.themealdb.com/meal/${meal.idMeal}`,
    license: 'TheMealDB free API; credit TheMealDB',
    tutorials,
    publishedNutrition: null,
  };
}
