import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { slugify } from '../derive/recipe.ts';
import { PACKAGE_ROOT } from '../paths.ts';
import { COURSES, type SourceRecipe } from '../types.ts';
import { SCHEMA_VERSION } from './sqlite.ts';
import type { RecipeRow } from './types.ts';

const text = z.string().trim().min(1);
const https = z.url({ protocol: /^https$/ });
const minutes = z.number().int().positive().nullable();
const sourceSchema = z
  .object({
    id: z.string().regex(/^(aptiva|usda):[a-z0-9-]+$/),
    source: z.enum(['aptiva', 'usda']),
    sourceId: text,
    title: text,
    area: text.nullable(),
    course: z.enum(COURSES).optional(),
    lines: z.array(z.object({ text, name: text.optional(), measure: text.optional() })).min(1),
    instructions: z.array(text).min(1),
    servings: z.number().int().min(1).max(48).nullable(),
    totalMinutes: minutes,
    sourceName: text,
    sourceUrl: https.nullable(),
    license: text,
    imageUrl: https.nullable(),
    imageCredit: text.nullable(),
    publisherId: text.optional(),
    matchSourceUrl: z.boolean().default(true),
  })
  .refine((r) => r.id.startsWith(r.source + ':'), { message: 'Recipe ID must match source' })
  .refine(
    (r) =>
      r.source === 'aptiva' ||
      (r.servings !== null &&
        r.totalMinutes !== null &&
        r.totalMinutes <= 30 &&
        r.sourceUrl !== null),
    { message: 'A curated USDA recipe needs a source, yield and total time of 30 minutes or less' },
  )
  .refine((r) => (r.imageUrl === null) === (r.imageCredit === null), {
    message: 'Photos require a credit',
  });

type SupplementalRecipe = z.infer<typeof sourceSchema>;

export interface RecipeIdentity {
  id: string;
  slug: string;
  title: string;
  source_url: string | null;
  ingredient_ids: string[];
}

export async function readSupplements(): Promise<SupplementalRecipe[]> {
  const dataDir = join(PACKAGE_ROOT, 'sources');
  const load = async (name: string, source: SourceRecipe['source']) => {
    const data = await readFile(join(dataDir, name), 'utf8');
    return z
      .array(sourceSchema.refine((r) => r.source === source))
      .parse(JSON.parse(data))
      .sort((a, b) => a.id.localeCompare(b.id));
  };
  const [usda, aptiva, exclusions] = await Promise.all([
    load('usda.json', 'usda'),
    load('aptiva.json', 'aptiva'),
    readFile(join(dataDir, 'aptiva-exclusions.json'), 'utf8'),
  ]);
  if (usda.length !== 25) throw new Error(`Expected 25 curated USDA recipes, got ${usda.length}`);
  const audit = z
    .object({
      shipped: z.number().int().positive(),
      candidates: z.number().int().nonnegative(),
      excluded: z.array(z.object({ id: text, reason: text })),
    })
    .parse(JSON.parse(exclusions));
  const sourceIds = [...aptiva.map((r) => r.sourceId), ...audit.excluded.map((r) => r.id)];
  if (
    audit.candidates !== aptiva.length ||
    audit.shipped !== sourceIds.length ||
    new Set(sourceIds).size !== sourceIds.length
  ) {
    throw new Error('Aptiva source audit does not account for every shipped recipe ID');
  }
  const recipes = [...usda, ...aptiva];
  if (new Set(recipes.map((r) => r.id)).size !== recipes.length)
    throw new Error('Duplicate supplemental recipe ID');
  return recipes;
}

export function toSourceRecipe(recipe: SupplementalRecipe): SourceRecipe {
  return {
    ...recipe,
    categories: [],
    tags: [],
    prepMinutes: null,
    cookMinutes: null,
    publishedNutrition: null,
    tutorials: [],
  };
}

export function readBaseline(path: string) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const meta = db.prepare('SELECT key, value FROM meta').all() as {
      key: string;
      value: string;
    }[];
    const values = new Map(meta.map(({ key, value }) => [key, value]));
    if (values.get('schema_version') !== String(SCHEMA_VERSION))
      throw new Error('Baseline catalog schema mismatch');
    const rows = db
      .prepare('SELECT id, slug, title, source_url, ingredient_ids FROM recipes ORDER BY id')
      .all() as Array<Omit<RecipeIdentity, 'ingredient_ids'> & { ingredient_ids: string }>;
    if (rows.length === 0 || rows.some(({ id }) => !/^(mealdb|medlineplus):/.test(id))) {
      throw new Error('Baseline must be a populated catalog before the Aptiva and USDA additions');
    }
    const coverage = db
      .prepare('SELECT count(ingredient_id) AS matched, count(*) AS total FROM recipe_ingredients')
      .get() as { matched: number; total: number };
    const ingredientIds = db.prepare('SELECT id FROM ingredients').pluck().all() as string[];
    return {
      identities: rows.map((r) => ({
        ...r,
        ingredient_ids: z.array(text).parse(JSON.parse(r.ingredient_ids)),
      })),
      coverage,
      ingredientIds: new Set(ingredientIds),
      sourceDigest: values.get('source_digest'),
    };
  } finally {
    db.close();
  }
}

function sourceKeys(url: string | null): string[] {
  if (!url) return [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/+$/, '');
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  const keys = [host + path + parsed.search];
  const mealDbId = host === 'themealdb.com' ? /\/meal\/(\d+)(?:-|\/|$)/.exec(path)?.[1] : undefined;
  if (mealDbId) keys.push(`mealdb:${mealDbId}`);
  return keys;
}

function ingredientOverlap(left: readonly string[], right: readonly string[]): number {
  const overlap = left.filter((id) => right.includes(id)).length;
  return overlap / (left.length + right.length - overlap || 1);
}

export class RecipeIndex {
  readonly slugs = new Set<string>();
  private readonly byKey = new Map<string, string>();
  private readonly byTitle = new Map<string, RecipeIdentity[]>();

  constructor(recipes: readonly RecipeIdentity[]) {
    for (const recipe of recipes) this.add(recipe);
  }

  add(
    recipe: RecipeIdentity,
    { publisherId, matchSourceUrl = true }: Partial<SupplementalRecipe> = {},
  ) {
    this.slugs.add(recipe.slug);
    const keys = [recipe.id, ...(matchSourceUrl ? sourceKeys(recipe.source_url) : [])];
    if (publisherId) keys.push(publisherId);
    for (const key of keys) if (!this.byKey.has(key)) this.byKey.set(key, recipe.id);
    const title = slugify(recipe.title);
    const entries = this.byTitle.get(title) ?? [];
    entries.push(recipe);
    this.byTitle.set(title, entries);
  }

  duplicate(recipe: Omit<RecipeRow, 'slug'>, source: SupplementalRecipe): string | undefined {
    const keys = [recipe.id, ...(source.matchSourceUrl ? sourceKeys(recipe.source_url) : [])];
    if (source.publisherId) keys.push(source.publisherId);
    for (const key of keys) {
      const id = this.byKey.get(key);
      if (id) return id;
    }
    return this.byTitle
      .get(slugify(recipe.title))
      ?.find((entry) => ingredientOverlap(entry.ingredient_ids, recipe.ingredient_ids) >= 0.5)?.id;
  }
}
