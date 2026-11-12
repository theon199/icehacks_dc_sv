import { readdir, readFile } from 'node:fs/promises';
import { parse, type HTMLElement } from 'node-html-parser';
import { cachePath } from '../paths.ts';
import { fileExists, politeFetch, writeAtomic } from '../net/http.ts';
import type { Nutrition, SourceIngredientLine, SourceRecipe } from '../types.ts';

const BASE = 'https://medlineplus.gov/recipes/';
const DIR = 'medlineplus';
export const MEDLINEPLUS_CREDIT = 'MedlinePlus, U.S. National Library of Medicine';

const RECIPE_URL = /^https:\/\/medlineplus\.gov\/recipes\/([a-z0-9-]+)\/$/;

async function cachedText(file: string, url: string): Promise<string> {
  const path = cachePath(DIR, file);
  if (!(await fileExists(path))) {
    const response = await politeFetch(url);
    await writeAtomic(path, await response.text());
  }
  return readFile(path, 'utf8');
}

/** Index pages are the category listings linked from the recipes home page. */
export function parseIndexLinks(html: string): string[] {
  const root = parse(html);
  const links = new Set<string>();
  for (const a of root.querySelectorAll('a')) {
    const href = a.getAttribute('href')?.trim() ?? '';
    if (RECIPE_URL.test(href)) links.add(href);
  }
  return [...links].sort();
}

export interface IndexEntry {
  slug: string;
  origin: string | null;
}

/** Recipe cards on a category page: link + the small origin label under the title. */
export function parseIndexCards(html: string): IndexEntry[] {
  const root = parse(html);
  const entries = new Map<string, IndexEntry>();
  for (const strong of root.querySelectorAll('p strong')) {
    const a = strong.querySelector('a');
    const match = RECIPE_URL.exec(a?.getAttribute('href')?.trim() ?? '');
    if (!match?.[1]) continue;
    const origin = strong.querySelector('span')?.text.trim() || null;
    entries.set(match[1], { slug: match[1], origin });
  }
  return [...entries.values()];
}

export async function fetchMedlinePlus(log: (message: string) => void): Promise<void> {
  const home = await cachedText('index/home.html', BASE);
  const categoryUrls = parseIndexLinks(home).filter((url) => url !== BASE);
  const slugs = new Map<string, Set<string>>();
  for (const url of categoryUrls) {
    const category = RECIPE_URL.exec(url)?.[1];
    if (!category) continue;
    const html = await cachedText(`index/${category}.html`, url);
    for (const card of parseIndexCards(html)) {
      const set = slugs.get(card.slug) ?? new Set<string>();
      set.add(category);
      slugs.set(card.slug, set);
    }
  }
  log(`MedlinePlus: ${categoryUrls.length} index pages, ${slugs.size} recipes`);
  let fetched = 0;
  for (const slug of [...slugs.keys()].sort()) {
    const path = cachePath(DIR, 'recipes', `${slug}.html`);
    if (await fileExists(path)) continue;
    await cachedText(`recipes/${slug}.html`, `${BASE}${slug}/`);
    fetched++;
    if (fetched % 50 === 0) log(`MedlinePlus: fetched ${fetched} recipe pages`);
  }
  log(`MedlinePlus: ${fetched} new recipe pages cached`);
}

const clean = (value: string) =>
  value
    .replace(/&nbsp;/g, ' ')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "1 hour 15 minutes" -> 75; returns null when no duration is present. */
export function parseDurationText(text: string): number | null {
  const t = text.toLowerCase();
  let minutes = 0;
  let found = false;
  const hours = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/.exec(t);
  if (hours?.[1]) {
    minutes += Number(hours[1]) * 60;
    found = true;
  }
  const mins = /(\d+)\s*(?:minutes?|mins?)\b/.exec(t);
  if (mins?.[1]) {
    minutes += Number(mins[1]);
    found = true;
  }
  return found ? Math.round(minutes) : null;
}

function sectionByHeading(root: HTMLElement, heading: RegExp): HTMLElement | null {
  for (const h of root.querySelectorAll('h3')) {
    if (heading.test(clean(h.text))) return h.parentNode;
  }
  return null;
}

/** Collects list items in document order, tracking short bold/paragraph sub-headings as sections. */
function ingredientLines(container: HTMLElement): SourceIngredientLine[] {
  const lines: SourceIngredientLine[] = [];
  let section: string | undefined;
  for (const node of container.childNodes) {
    if (!('tagName' in node)) continue;
    const el = node as HTMLElement;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      for (const li of el.querySelectorAll('li')) {
        const text = clean(li.text);
        if (text) lines.push(section ? { text, section } : { text });
      }
    } else if (tag === 'p' || tag === 'h4' || tag === 'h5') {
      const text = clean(el.text).replace(/:$/, '');
      if (text && text.length <= 60) section = text;
    }
  }
  return lines;
}

function nutritionValue(rows: string[], label: RegExp, unit: 'g' | 'mg'): number | null {
  for (const row of rows) {
    const match = label.exec(row);
    if (!match) continue;
    const value = new RegExp(`(<\\s*)?(\\d+(?:\\.\\d+)?)\\s*${unit}\\b`, 'i').exec(row.slice(match.index + match[0].length));
    if (!value?.[2]) continue;
    return value[1] ? 0 : Number(value[2]);
  }
  return null;
}

export function parseNutritionFacts(root: HTMLElement): { nutrition: Nutrition; servingGrams: number | null } | null {
  const box = root.querySelector('.mp-nutrition');
  if (!box) return null;
  const rows = box.querySelectorAll('.fact-row').map((row) => clean(row.querySelector('.fact-left')?.text ?? row.text));
  const calorieRow = box.querySelector('.fact-calories .fact-right');
  const kcal = calorieRow ? Number(clean(calorieRow.text).replace(/[^\d.]/g, '')) : NaN;
  const servingText = clean(box.querySelector('.facts-serving-size')?.text ?? '');
  const grams = /\((\d+(?:\.\d+)?)\s*g\)/i.exec(servingText);
  const nutrition: Nutrition = {
    kcal: Number.isFinite(kcal) && clean(calorieRow?.text ?? '') !== '' ? kcal : null,
    fat_g: nutritionValue(rows, /^Total Fat/i, 'g'),
    sat_fat_g: nutritionValue(rows, /^Saturated Fat/i, 'g'),
    sodium_mg: nutritionValue(rows, /^Sodium/i, 'mg'),
    carbs_g: nutritionValue(rows, /^Total Carbohydrate/i, 'g'),
    fiber_g: nutritionValue(rows, /^Dietary Fiber/i, 'g'),
    sugar_g: nutritionValue(rows, /^Total Sugars/i, 'g'),
    added_sugar_g: (() => {
      const row = rows.find((r) => /Added Sugars/i.test(r));
      const m = row ? /(\d+(?:\.\d+)?)\s*g/i.exec(row) : null;
      return m?.[1] ? Number(m[1]) : null;
    })(),
    protein_g: nutritionValue(rows, /^Protein/i, 'g'),
  };
  if (nutrition.kcal === null) return null;
  return { nutrition, servingGrams: grams?.[1] ? Number(grams[1]) : null };
}

export interface MedlinePlusPage {
  slug: string;
  title: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  lines: SourceIngredientLine[];
  directions: string[];
  imageUrl: string | null;
  nutrition: Nutrition | null;
  servingGrams: number | null;
  origin: string | null;
}

export function parseRecipePage(slug: string, html: string): MedlinePlusPage {
  const root = parse(html);
  const title = clean(root.querySelector('h1')?.text ?? '');
  const info = root.querySelector('.recipe-info');
  const infoText = info ? clean(info.text) : '';
  const grab = (label: string) => {
    const match = new RegExp(`${label}:\\s*(.*?)(?=(?:Prep time|Cook time|Total time|Number of Servings):|$)`, 'i').exec(infoText);
    return match?.[1]?.trim() ?? '';
  };
  const servingsMatch = /(\d+)/.exec(grab('Number of Servings'));

  const ingredientsSection = sectionByHeading(root, /^Ingredients$/i);
  const directionsSection = sectionByHeading(root, /^Directions$/i);
  const directions: string[] = [];
  const list = directionsSection?.querySelector('ol') ?? directionsSection?.querySelector('ul');
  for (const li of list?.querySelectorAll('li') ?? []) {
    const text = clean(li.text);
    if (text) directions.push(text);
  }

  const img = root.querySelector('.mp-img img')?.getAttribute('src') ?? null;
  const og = root.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null;
  const facts = parseNutritionFacts(root);
  let origin: string | null = null;
  if (root.querySelector('.fh-recipe')) origin = 'FoodHero.org';
  else if (root.querySelector('.nhlbi-recipe')) origin = 'NHLBI';

  return {
    slug,
    title,
    servings: servingsMatch?.[1] ? Number(servingsMatch[1]) : null,
    prepMinutes: parseDurationText(grab('Prep time')),
    cookMinutes: parseDurationText(grab('Cook time')),
    totalMinutes: parseDurationText(grab('Total time')),
    lines: ingredientsSection ? ingredientLines(ingredientsSection) : [],
    directions,
    imageUrl: img ?? og,
    nutrition: facts?.nutrition ?? null,
    servingGrams: facts?.servingGrams ?? null,
    origin,
  };
}

/** Category listing membership per recipe slug, from the cached index pages. */
async function readCategoryMembership(): Promise<Map<string, string[]>> {
  const dir = cachePath(DIR, 'index');
  const membership = new Map<string, string[]>();
  for (const file of (await readdir(dir)).sort()) {
    if (!file.endsWith('.html') || file === 'home.html') continue;
    const category = file.replace(/\.html$/, '');
    for (const card of parseIndexCards(await readFile(cachePath(DIR, 'index', file), 'utf8'))) {
      membership.set(card.slug, [...(membership.get(card.slug) ?? []), category]);
    }
  }
  return membership;
}

export async function readMedlinePlusRecipes(): Promise<SourceRecipe[]> {
  const membership = await readCategoryMembership();
  const recipes: SourceRecipe[] = [];
  for (const slug of [...membership.keys()].sort()) {
    const path = cachePath(DIR, 'recipes', `${slug}.html`);
    if (!(await fileExists(path))) continue;
    const page = parseRecipePage(slug, await readFile(path, 'utf8'));
    if (!page.title) continue;
    const url = `${BASE}${slug}/`;
    const originNote = page.origin === 'FoodHero.org' ? ' (recipe from FoodHero.org)' : page.origin === 'NHLBI' ? ' (recipe from NHLBI)' : '';
    recipes.push({
      id: `medlineplus:${slug}`,
      source: 'medlineplus',
      sourceId: slug,
      title: page.title,
      categories: membership.get(slug) ?? [],
      area: null,
      tags: [],
      lines: page.lines,
      instructions: page.directions,
      servings: page.servings,
      prepMinutes: page.prepMinutes,
      cookMinutes: page.cookMinutes,
      totalMinutes: page.totalMinutes,
      imageUrl: page.imageUrl,
      imageCredit: page.imageUrl ? MEDLINEPLUS_CREDIT : null,
      sourceName: `MedlinePlus${originNote}`,
      sourceUrl: url,
      license: 'Public domain (MedlinePlus Healthy Recipes); courtesy of MedlinePlus from the National Library of Medicine',
      tutorials: [{ kind: 'web', url, title: page.title, publisher: 'MedlinePlus' }],
      publishedNutrition: page.nutrition,
    });
  }
  return recipes;
}
