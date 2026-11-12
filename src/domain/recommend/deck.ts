/**
 * Builds the Discover deck. Steps:
 *   1. Drop duplicates, anything unsafe for the person, anything they passed on recently, explicit
 *      exclusions, and recipes that do not fit the mode.
 *   2. Score the rest (`score.ts`).
 *   3. Rank by score, then reorder the best `samplePoolPerCard × size` by sampling without
 *      replacement from softmax(score / temperature), using seeded Gumbel noise keyed by recipe
 *      id: a new seed gives a fresh deck, the same seed replays it exactly, regardless of the
 *      order candidates arrive in. Candidates below the sampling pool keep their ranked order.
 *   4. Diversify the sampled order and explain each card.
 */
import { FEATURE_COUNT, type RankingConfig } from './config';
import { createRankContext, type RankContext, type RankInput } from './context';
import { diversify } from './diversify';
import { explainRecipe, type ExplainMode, type FitReason } from './explain';
import { keyedSource, type Seed } from './random';
import { scoreCandidates, sortIndices } from './rank';
import { pantryCoverage, readFeatures, toFitScore, type FeatureVector } from './score';
import { DAY_MS } from './taste';
import { isRecipeSafe } from '../safety/checkRecipe';
import { type FeedbackEvent } from '../types/feedback';
import { type RecipeId, type RecipeSummary } from '../types/recipe';

export const DECK_MODES = [
  'forYou',
  'quick',
  'pantry',
  'gentle',
] as const satisfies readonly ExplainMode[];

export type DeckMode = (typeof DECK_MODES)[number];

export interface BuildDeckInput extends RankInput {
  readonly candidates: readonly RecipeSummary[];
  readonly mode: DeckMode;
  readonly seed: Seed;
  /** Number of cards wanted. */
  readonly size: number;
  /** Ids to leave out, e.g. cards already on screen. */
  readonly exclude?: Iterable<RecipeId>;
}

export interface DeckCard {
  readonly recipe: RecipeSummary;
  readonly score: number;
  /** 0–100 for the card's ring. */
  readonly fitScore: number;
  readonly features: FeatureVector;
  readonly reasons: readonly FitReason[];
  /** Suggested portion multiplier (0.5 for small appetites). */
  readonly portionScale: number;
}

export interface DeckExclusions {
  readonly unsafe: number;
  readonly recentlyPassed: number;
  readonly excluded: number;
  readonly outsideMode: number;
}

export interface Deck {
  readonly cards: readonly DeckCard[];
  readonly mode: DeckMode;
  readonly seed: Seed;
  readonly configVersion: number;
  /** Candidates that passed every filter; when ≤ cards.length the mode has nothing more to offer. */
  readonly available: number;
  readonly excluded: DeckExclusions;
}

/** Ids whose most recent feedback is a pass or "not for me" still inside its cooldown. */
export function recentlyPassedIds(
  feedback: readonly FeedbackEvent[],
  now: number,
  config: RankingConfig,
): Set<RecipeId> {
  const latest = new Map<RecipeId, FeedbackEvent>();
  for (const event of feedback) {
    const previous = latest.get(event.recipeId);
    if (!previous || event.at >= previous.at) latest.set(event.recipeId, event);
  }
  const out = new Set<RecipeId>();
  for (const [id, event] of latest) {
    const cooldownDays =
      event.kind === 'pass'
        ? config.feed.passCooldownDays
        : event.kind === 'not_for_me'
          ? config.feed.notForMeCooldownDays
          : 0;
    if (cooldownDays > 0 && now - event.at < cooldownDays * DAY_MS) out.add(id);
  }
  return out;
}

export function fitsMode(recipe: RecipeSummary, mode: DeckMode, ctx: RankContext): boolean {
  switch (mode) {
    case 'forYou':
      return true;
    case 'quick':
      return recipe.totalMinutes !== null && recipe.totalMinutes <= ctx.config.feed.quickMaxMinutes;
    case 'pantry':
      return pantryCoverage(recipe, ctx) >= ctx.config.feed.pantryMinCoverage;
    case 'gentle':
      return recipe.gentle;
  }
}

/**
 * Ranked order with its head shuffled: the best `samplePoolPerCard × size` indices are reordered by
 * `score / temperature + Gumbel(seed, id)`, and the rest follow in score order.
 */
export function sampleOrder(
  score: Float64Array,
  ids: readonly RecipeId[],
  size: number,
  seed: Seed,
  config: RankingConfig,
): Uint32Array {
  const ranked = sortIndices(score, ids);
  const { temperature, samplePoolPerCard } = config.feed;
  const depth = Math.min(ranked.length, Math.ceil(size * samplePoolPerCard));
  if (temperature <= 0 || depth < 2) return ranked;

  const noise = keyedSource(seed);
  const headKeys = new Float64Array(depth);
  const headIds: RecipeId[] = new Array<RecipeId>(depth);
  for (let k = 0; k < depth; k++) {
    const i = ranked[k]!;
    headKeys[k] = score[i]! / temperature + noise.gumbel(ids[i]!);
    headIds[k] = ids[i]!;
  }
  const head = sortIndices(headKeys, headIds);
  const out = new Uint32Array(ranked.length);
  for (let k = 0; k < depth; k++) out[k] = ranked[head[k]!]!;
  out.set(ranked.subarray(depth), depth);
  return out;
}

export function buildDeck(input: BuildDeckInput): Deck {
  const ctx = createRankContext(input, input.candidates);
  const { config } = ctx;
  const passed = recentlyPassedIds(input.feedback ?? [], input.now, config);
  const excludeIds = new Set(input.exclude);

  const pool: RecipeSummary[] = [];
  const seen = new Set<RecipeId>();
  let unsafe = 0;
  let recentlyPassed = 0;
  let excluded = 0;
  let outsideMode = 0;
  const candidates = input.candidates;
  for (let i = 0; i < candidates.length; i++) {
    const recipe = candidates[i]!;
    if (seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    if (!isRecipeSafe(recipe, ctx.safety)) unsafe++;
    else if (excludeIds.has(recipe.id)) excluded++;
    else if (passed.has(recipe.id)) recentlyPassed++;
    else if (!fitsMode(recipe, input.mode, ctx)) outsideMode++;
    else pool.push(recipe);
  }

  const size = Math.max(0, Math.floor(input.size));
  const scored = scoreCandidates(pool, ctx);
  const ids = pool.map((recipe) => recipe.id);
  const order = sampleOrder(scored.score, ids, size, input.seed, config);
  const picks = diversify(order, pool, size, config.diversity);

  const portionScale =
    input.mode === 'gentle' || input.prefs.smallAppetite ? config.feed.gentlePortionScale : 1;
  const cards = picks.map((i): DeckCard => {
    const recipe = pool[i]!;
    const features = readFeatures(scored.features, i * FEATURE_COUNT);
    return {
      recipe,
      score: scored.score[i]!,
      fitScore: toFitScore(scored.base[i]!),
      features,
      reasons: explainRecipe(recipe, features, ctx, input.mode),
      portionScale,
    };
  });

  return {
    cards,
    mode: input.mode,
    seed: input.seed,
    configVersion: config.version,
    available: pool.length,
    excluded: { unsafe, recentlyPassed, excluded, outsideMode },
  };
}
