/**
 * Chooses the catalog recipes Chef may recommend for one question. Chef can only name recipes
 * from this list, so it decides what the answer can contain: dishes matching words in the
 * question come first, then a broad, cuisine-balanced selection led by the person's favourites.
 * Every recipe is screened against the person's allergens and diet before it is offered.
 */
import { compileSafetyRules, isRecipeSafe, type SafetyPrefs } from '@/domain/safety';
import type { ChefCandidate } from '@/lib/api/ai';
import type { RecipeSummary } from '@/lib/catalog';

/** The most candidates the `chef` function accepts. */
export const MAX_CHEF_CANDIDATES = 60;
/** At most this many broad-pool recipes share one cuisine, so the list stays varied. */
export const MAX_PER_CUISINE = 12;

/** Ids the `chef` function accepts; anything else would fail the whole request. */
const CANDIDATE_ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,79}$/;
const MAX_TITLE = 160;
const MAX_TAG = 40;
const MAX_TAGS = 12;

export interface CandidateSources {
  /** Recipes matching words in the question, most relevant first. */
  readonly matches: readonly RecipeSummary[];
  /** The broad pool, best first. */
  readonly pool: readonly RecipeSummary[];
}

export interface CandidateOptions {
  readonly prefs: SafetyPrefs;
  readonly lovedCuisines: readonly string[];
  readonly max?: number;
}

/** Picks and screens the recipes to offer; the result is safe for the person and has unique ids. */
export function pickCandidates(
  sources: CandidateSources,
  { prefs, lovedCuisines, max = MAX_CHEF_CANDIDATES }: CandidateOptions,
): RecipeSummary[] {
  const rules = compileSafetyRules(prefs);
  const limit = Math.max(0, Math.min(max, MAX_CHEF_CANDIDATES));
  const picked: RecipeSummary[] = [];
  const seen = new Set<string>();
  const accept = (recipe: RecipeSummary): boolean => {
    if (picked.length >= limit || seen.has(recipe.id)) return false;
    if (!CANDIDATE_ID.test(recipe.id) || !recipe.title.trim()) return false;
    if (!isRecipeSafe(recipe, rules)) return false;
    seen.add(recipe.id);
    picked.push(recipe);
    return true;
  };

  for (const recipe of sources.matches) accept(recipe);

  const loved = new Set(lovedCuisines);
  // Stable: favourites first, otherwise the pool's own order.
  const pool = [...sources.pool].sort(
    (a, b) => Number(loved.has(b.cuisine)) - Number(loved.has(a.cuisine)),
  );
  const perCuisine = new Map<string, number>();
  for (const recipe of pool) {
    if (picked.length >= limit) break;
    const count = perCuisine.get(recipe.cuisine) ?? 0;
    if (count >= MAX_PER_CUISINE) continue;
    if (accept(recipe)) perCuisine.set(recipe.cuisine, count + 1);
  }
  return picked;
}

function clip(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > max ? clean.slice(0, max).trimEnd() : clean;
}

function bounded(value: number | null, max: number, digits = 0): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const factor = 10 ** digits;
  return Math.min(max, Math.round(value * factor) / factor);
}

/** The wire shape for one candidate, trimmed to the function's limits. */
export function toChefCandidate(recipe: RecipeSummary): ChefCandidate {
  const tags = [recipe.course, ...recipe.goalTags, recipe.gentle ? 'gentle' : null]
    .filter((tag): tag is string => !!tag)
    .map((tag) => clip(tag, MAX_TAG))
    .filter(Boolean)
    .slice(0, MAX_TAGS);
  const minutes = bounded(recipe.totalMinutes, 2880);
  return {
    id: recipe.id,
    title: clip(recipe.title, MAX_TITLE),
    cuisine: clip(recipe.cuisine, 40) || 'other',
    minutes: minutes == null ? null : Math.trunc(minutes),
    kcal: bounded(recipe.nutrition?.kcal ?? null, 10_000),
    protein_g: bounded(recipe.nutrition?.proteinG ?? null, 1000, 1),
    tags,
  };
}
