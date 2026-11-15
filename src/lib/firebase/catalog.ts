import { z } from 'zod';

import { readFirestoreBatch, readFirestoreJson } from './firestore';
import { LruCache } from '../catalog/lru';
import { candidateRowSchema, ingredientRowSchema, substitutionRowSchema } from '../catalog/rows';
import type { TermGroup } from '../catalog/searchQuery';

const lifetime = 5 * 60_000;
const cache = new LruCache<string, unknown>(180, lifetime);
const recipeRows = z.array(candidateRowSchema);
type Recipe = z.infer<typeof candidateRowSchema>;
const manifestSchema = z.object({
  version: z.string().regex(/^[a-f0-9]{32}$/),
  pageSize: z.number().int().positive(),
  ids: z.array(z.string()),
  prefixes: z.array(z.string()),
  meta: z.array(z.object({ key: z.string(), value: z.string() })),
});
type Catalog = z.infer<typeof manifestSchema>;

async function getDocument(path: string): Promise<unknown> {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;
  const value = await readFirestoreJson(path);
  if (value !== null) cache.set(path, value);
  return value;
}

function pathAt(catalog: Catalog, collection: string, key: string | number) {
  return `${collection}/${catalog.version}~${key}`;
}

const strings = z.array(z.string());
const filtersSchema = z.object({
  diet: z.number().optional(),
  cuisines: strings.optional(),
  courses: strings.optional(),
  max_minutes: z.number().optional(),
  max_kcal: z.number().optional(),
  gentle: z.boolean().optional(),
  avoid_allergens: strings.optional(),
  goals: strings.optional(),
  exclude_ids: strings.optional(),
  pantry_ids: strings.optional(),
  min_coverage: z.number().optional(),
});
type Filters = z.infer<typeof filtersSchema>;

interface RecipeArgs {
  p_ids?: string[];
  p_family_id?: string;
  p_limit?: number;
  p_offset?: number;
  p_filters?: unknown;
}

function matchesFilters(row: Recipe, f: Filters, family: string | undefined): boolean {
  if (family !== undefined && row.family_id !== family) return false;
  if (f.diet && (row.diet_flags & f.diet) !== f.diet) return false;
  if (f.cuisines && !f.cuisines.includes(row.cuisine)) return false;
  if (f.courses && !f.courses.includes(row.course)) return false;
  if (
    f.max_minutes !== undefined &&
    (row.total_minutes === null || row.total_minutes > f.max_minutes)
  )
    return false;
  if (f.max_kcal !== undefined && (row.kcal === null || row.kcal > f.max_kcal)) return false;
  if (f.gentle && row.gentle !== 1) return false;
  if (f.exclude_ids?.includes(row.id)) return false;
  if (f.avoid_allergens?.length) {
    const known = z.record(z.string(), z.string()).safeParse(JSON.parse(row.allergens));
    if (!known.success || f.avoid_allergens.some((id) => known.data[id] !== 'free')) return false;
  }
  if (f.goals?.length) {
    const tags = strings.parse(JSON.parse(row.goal_tags));
    if (!f.goals.every((tag) => tags.includes(tag))) return false;
  }
  if (f.pantry_ids) {
    const core = strings.parse(JSON.parse(row.core_ingredient_ids));
    const coverage = core.filter((id) => f.pantry_ids?.includes(id)).length / core.length;
    if (!core.length || coverage < (f.min_coverage ?? 0)) return false;
  }
  return true;
}

/** Queries the versioned Firestore prefix postings. Each query position must match an alternative. */
async function recipeOrdinals(catalog: Catalog, groups: readonly TermGroup[]): Promise<number[]> {
  const terms = [...new Set(groups.flat(2))];
  const prefixes = [...new Set(terms.map((term) => term.slice(0, 1)))];
  const shards = await Promise.all(
    prefixes.map(async (prefix) => {
      const value = catalog.prefixes.includes(prefix)
        ? await getDocument(pathAt(catalog, 'catalogIndex', encodeURIComponent(prefix)))
        : {};
      return [prefix, z.record(z.string(), z.array(z.number().int())).parse(value)] as const;
    }),
  );
  const byPrefix = new Map(shards);
  const postings = new Map<string, Map<number, number>>();
  for (const term of terms) {
    const byTerm = byPrefix.get(term.slice(0, 1)) ?? {};
    const found = new Map<number, number>();
    for (const [word, entries] of Object.entries(byTerm)) {
      if (!word.startsWith(term)) continue;
      for (const entry of entries) {
        const id = Math.floor(entry / 4);
        const weight = entry % 4;
        found.set(id, Math.max(found.get(id) ?? 0, weight));
      }
    }
    postings.set(term, found);
  }
  const scores = new Map<number, number>();
  for (const [index, group] of groups.entries()) {
    const matches = new Map<number, number>();
    for (const words of group) {
      const first = postings.get(words[0] ?? '') ?? new Map<number, number>();
      for (const [id, weight] of first) {
        const rest = words.slice(1).map((word) => postings.get(word)?.get(id) ?? 0);
        if (rest.every((value) => value > 0)) {
          const sum = weight + rest.reduce((total, value) => total + value, 0);
          matches.set(id, Math.max(matches.get(id) ?? 0, sum / words.length));
        }
      }
    }
    if (index === 0) {
      for (const [id, weight] of matches) scores.set(id, weight);
    } else {
      for (const [id, weight] of scores) {
        const bonus = matches.get(id);
        if (bonus === undefined) scores.delete(id);
        else scores.set(id, weight + bonus);
      }
    }
  }
  return [...scores].sort(([a, x], [b, y]) => y - x || a - b).map(([id]) => id);
}

async function readPageRows(catalog: Catalog, ordinals: readonly number[]): Promise<Recipe[]> {
  const pagePath = (id: number) =>
    pathAt(catalog, 'catalogPages', Math.floor(id / catalog.pageSize));
  const paths = [...new Set(ordinals.map(pagePath))];
  const byPage = new Map<string, Recipe[]>();
  const missing: string[] = [];
  for (const path of paths) {
    const rows = cache.get(path);
    if (rows === undefined) missing.push(path);
    else byPage.set(path, recipeRows.parse(rows));
  }
  for (let i = 0; i < missing.length; i += 20) {
    const batch = missing.slice(i, i + 20);
    const docs = await readFirestoreBatch(batch);
    for (const path of batch) {
      const rows = recipeRows.parse(docs.get(path));
      byPage.set(path, rows);
      cache.set(path, rows);
    }
  }
  return ordinals.map((id) => {
    const recipe = byPage.get(pagePath(id))?.[id % catalog.pageSize];
    if (!recipe || recipe.id !== catalog.ids[id])
      throw new Error('Firestore recipe page is inconsistent.');
    return recipe;
  });
}

async function readRecipes(catalog: Catalog, args: RecipeArgs, groups: readonly TermGroup[]) {
  const filters = filtersSchema.parse(args.p_filters ?? {});
  const offset = args.p_offset ?? 0;
  const limit = args.p_limit ?? 31;
  const ids = new Set(args.p_ids);
  const ordinals = groups.length
    ? await recipeOrdinals(catalog, groups)
    : catalog.ids.flatMap((id, index) => (args.p_ids && !ids.has(id) ? [] : [index]));
  if (
    Object.keys(filters).every((key) => filters[key as keyof Filters] === undefined) &&
    !args.p_family_id
  ) {
    return readPageRows(catalog, ordinals.slice(offset, offset + limit));
  }
  const results: Recipe[] = [];
  for (let start = 0; start < ordinals.length && results.length < offset + limit; start += 250) {
    const rows = await readPageRows(catalog, ordinals.slice(start, start + 250));
    results.push(...rows.filter((row) => matchesFilters(row, filters, args.p_family_id)));
  }
  return results.slice(offset, offset + limit);
}

export async function readFirebaseCatalog(
  name: string,
  args: Record<string, unknown>,
  groups: readonly TermGroup[] = [],
): Promise<unknown> {
  const catalog = manifestSchema.parse(await getDocument('catalog/current'));
  switch (name) {
    case 'catalog_meta':
      return catalog.meta;
    case 'catalog_recipes':
      return readRecipes(catalog, args, groups);
    case 'catalog_recipe_detail': {
      const ordinal = catalog.ids.indexOf(String(args.p_id));
      return ordinal < 0 ? null : getDocument(pathAt(catalog, 'catalogRecipes', ordinal));
    }
    case 'catalog_cuisines':
      return getDocument(pathAt(catalog, 'catalog', 'cuisines'));
    case 'catalog_ingredients': {
      const rows = z
        .array(ingredientRowSchema)
        .parse(await getDocument(pathAt(catalog, 'catalog', 'ingredients')));
      const ids = strings.optional().parse(args.p_ids);
      const phrases = strings.optional().parse(args.p_phrases);
      return rows.filter(
        (row) =>
          (!ids || ids.includes(row.id)) &&
          (!args.p_staples_only || row.pantry_staple === 1) &&
          (!phrases ||
            phrases.some((p) =>
              [row.name, row.plural ?? '', row.id.replace(/_/g, ' ')].some((value) =>
                value.toLowerCase().includes(p),
              ),
            )),
      );
    }
    case 'catalog_substitutions': {
      const rows = z
        .array(substitutionRowSchema)
        .parse(await getDocument(pathAt(catalog, 'catalog', 'substitutions')));
      const ids = strings.parse(args.p_ids);
      const goals = strings.optional().parse(args.p_goals);
      return rows.filter(
        (row) => ids.includes(row.from_id) && (!goals || goals.includes(row.goal)),
      );
    }
    default:
      throw new Error('Unknown catalog query.');
  }
}
