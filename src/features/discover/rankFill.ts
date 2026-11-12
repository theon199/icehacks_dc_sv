/**
 * The pure body of one deck fill: turn catalog candidates into the engine's shape (once per query
 * result), keep cards already queued or swiped out of the fill together with every other variant
 * of their dishes, and rank the next batch.
 */
import { buildDeck, type BuildDeckInput, type DeckCard, type RecipeSummary } from '@/domain';
import type { RecipeCandidate } from '@/lib/catalog';

import { toRankRecipe } from './deps';

export interface RankPool {
  readonly recipes: readonly RecipeSummary[];
  /** Recipe ids by dish family, so a fill can leave out variants of dishes already shown. */
  readonly families: ReadonlyMap<string, readonly string[]>;
}

const poolCache = new WeakMap<readonly RecipeCandidate[], RankPool>();

/** Candidates in the engine's shape, converted once per query result. */
export function rankPool(candidates: readonly RecipeCandidate[]): RankPool {
  const cached = poolCache.get(candidates);
  if (cached) return cached;
  const recipes = candidates.map(toRankRecipe);
  const families = new Map<string, string[]>();
  for (const recipe of recipes) {
    const members = families.get(recipe.familyId) ?? [];
    if (members.length === 0) families.set(recipe.familyId, members);
    members.push(recipe.id);
  }
  const pool: RankPool = { recipes, families };
  poolCache.set(candidates, pool);
  return pool;
}

/**
 * Ids to leave out of a fill: the given ids plus every member of their dish families. A recipe
 * that has dropped out of the current pool is still matched through `history`.
 */
export function familyExclusions(
  ids: Iterable<string>,
  families: ReadonlyMap<string, readonly string[]>,
  history: ReadonlyMap<string, RecipeSummary>,
): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(id);
    const familyId = history.get(id)?.familyId;
    const members = familyId === undefined ? undefined : families.get(familyId);
    members?.forEach((member) => out.add(member));
  }
  return out;
}

export interface RankFillInput extends Omit<BuildDeckInput, 'candidates' | 'history' | 'exclude'> {
  readonly candidates: readonly RecipeCandidate[];
  /** Every recipe ranked so far this session; this fill's pool is added to it. */
  readonly history: Map<string, RecipeSummary>;
  /** Ids on screen or swiped this session. */
  readonly hidden: Iterable<string>;
}

/** Ranks the next batch of cards for the deck. */
export function rankFill({
  candidates,
  history,
  hidden,
  ...rest
}: RankFillInput): readonly DeckCard[] {
  const { recipes, families } = rankPool(candidates);
  recipes.forEach((recipe) => history.set(recipe.id, recipe));
  const exclude = familyExclusions(hidden, families, history);
  return buildDeck({ ...rest, candidates: recipes, history, exclude }).cards;
}
