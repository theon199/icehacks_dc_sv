/**
 * Ranking configuration. Every number that shapes recommendations lives here so tuning is a
 * reviewable diff. Bump `version` whenever a value changes; the version is stamped on every deck so
 * feedback can be analysed against the configuration that produced it.
 *
 * How a recipe is scored:
 *   1. Seven features, each in [0, 1] (see `FEATURES`).
 *   2. `base = Σ weights[f] · feature[f]`; the weights sum to 1, so `base` is in [0, 1] and
 *      `fitScore = round(100 · base)` is what the card's ring shows.
 *   3. `score = clamp(base − repetition penalties − disliked-ingredient penalty + novelty boost
 *      + small-appetite boost)`; the feed samples from `score`, not `fitScore`, because freshness
 *      is about the feed rather than how well the dish fits the person.
 *
 * goalMatch is a blend, not a product: `coverageShare · (goals served / goals chosen) +
 * (1 − coverageShare) · healthScore`. Health score lifts every recipe a little on its own, so a
 * nutritious dish that serves none of the chosen goals still edges out an unhealthy one, while
 * serving a goal always matters more. With no goals chosen, goalMatch is the health score.
 *
 * Feed sampling: only the best `samplePoolPerCard × size` recipes by score are shuffled (Gumbel
 * noise at `temperature`); the rest follow in strict score order and are reached only when
 * diversity rules skip the sampled ones. That keeps the head of a deck near the top of the
 * ranking on large catalogs while still varying between sessions.
 */

export const FEATURES = [
  'cuisineMatch',
  'goalMatch',
  'timeFit',
  'effortFit',
  'pantryCoverage',
  'tasteHistory',
  'dataQuality',
] as const;

export type FeatureName = (typeof FEATURES)[number];

export const FEATURE_COUNT = FEATURES.length;

/** Index of each feature inside packed feature arrays. */
export const F = {
  cuisineMatch: 0,
  goalMatch: 1,
  timeFit: 2,
  effortFit: 3,
  pantryCoverage: 4,
  tasteHistory: 5,
  dataQuality: 6,
} as const satisfies Record<FeatureName, number>;

export interface RankingConfig {
  readonly version: number;
  /** Feature weights; must sum to 1. */
  readonly weights: Readonly<Record<FeatureName, number>>;
  readonly cuisine: {
    /** Recipe cuisine is one the person loves. */
    readonly loved: number;
    /** Same region as a loved cuisine (Vietnamese for someone who loves Thai). */
    readonly sameRegion: number;
    readonly other: number;
    /** Used for everyone when no cuisines were picked. */
    readonly noPreference: number;
  };
  readonly goal: {
    /** Share of goalMatch from goal coverage; the rest comes from the catalog health score. */
    readonly coverageShare: number;
  };
  readonly time: {
    /** Score for recipes without a total time. */
    readonly unknown: number;
    /** timeFit falls linearly from 1 at the budget to 0 at `zeroAtMultiple × budget`. */
    readonly zeroAtMultiple: number;
    /** Budget assumed when a person has none but has said recipes take too long. */
    readonly impliedBudgetMinutes: number;
    /** How far "too long" feedback can shrink the budget (0.4 → down to 60 % of it). */
    readonly maxShrink: number;
  };
  readonly effort: {
    /** effortFit for recipes one and two levels above what the person is happy with. */
    readonly onePastLimit: number;
    readonly twoPastLimit: number;
  };
  readonly dataQuality: {
    readonly computed: number;
    readonly estimated: number;
    readonly none: number;
  };
  readonly taste: {
    readonly halfLifeDays: number;
    readonly signal: {
      readonly like: number;
      readonly save: number;
      readonly cooked: number;
      readonly pass: number;
      readonly not_for_me: number;
    };
    /** Extra (negative) signal applied by each "not for me" reason. */
    readonly reasonPenalty: {
      readonly not_my_cuisine: number;
      /** Applied to the named ingredient. */
      readonly dislike_ingredient: number;
      /** Applied to each core ingredient when no ingredient was named. */
      readonly dislike_unnamed_ingredient: number;
      readonly too_long: number;
      readonly too_heavy: number;
    };
    /** Fraction of a recipe's signal credited to each of its ingredients and goal tags. */
    readonly ingredientShare: number;
    readonly goalTagShare: number;
    /** Affinities are clamped to ±clamp. */
    readonly clamp: number;
    /** Mix of cuisine, ingredient and goal-tag affinity in the raw taste value. */
    readonly mix: {
      readonly cuisine: number;
      readonly ingredients: number;
      readonly goalTags: number;
    };
    /** Weight of the single most disliked ingredient on top of the ingredient mean. */
    readonly worstIngredientShare: number;
    /** tasteHistory = 0.5 + 0.5 · tanh(raw / softness). */
    readonly softness: number;
    /** Calories above which "too heavy" feedback starts to count against a recipe, and its span. */
    readonly heavyKcalFrom: number;
    readonly heavyKcalSpan: number;
  };
  readonly penalties: {
    readonly recentlyShown: number;
    readonly shownHalfLifeDays: number;
    readonly recentlyCooked: number;
    readonly cookedHalfLifeDays: number;
    /** Older impressions and cooks are ignored entirely. */
    readonly windowDays: number;
    /** Penalty when a recipe uses an ingredient with affinity at or below `dislikedAffinity`. */
    readonly dislikedIngredient: number;
    readonly dislikedAffinity: number;
  };
  readonly boosts: {
    /** Unseen cuisine inside a loved region. */
    readonly novelty: number;
    /** Gentle recipes for people in small appetite mode. */
    readonly gentle: number;
  };
  readonly feed: {
    /** Softmax temperature over scores for sampling; lower is closer to strict ranking. */
    readonly temperature: number;
    /** Only the best `samplePoolPerCard × size` candidates are sampled; the rest stay ranked. */
    readonly samplePoolPerCard: number;
    readonly passCooldownDays: number;
    readonly notForMeCooldownDays: number;
    readonly quickMaxMinutes: number;
    readonly pantryMinCoverage: number;
    /** Portion scale suggested on gentle-mode cards. */
    readonly gentlePortionScale: number;
  };
  readonly diversity: {
    /**
     * At most `cuisineCap` cards of one cuisine, and `regionCap` cards of one region, in any
     * `window` consecutive cards.
     */
    readonly cuisineCap: number;
    readonly regionCap: number;
    readonly window: number;
    /** Highest allowed Jaccard overlap of core ingredients between two cards in a deck. */
    readonly maxIngredientOverlap: number;
  };
}

export const RANKING_CONFIG_V1: RankingConfig = {
  version: 1,
  weights: {
    cuisineMatch: 0.24,
    goalMatch: 0.2,
    timeFit: 0.12,
    effortFit: 0.08,
    pantryCoverage: 0.1,
    tasteHistory: 0.2,
    dataQuality: 0.06,
  },
  cuisine: { loved: 1, sameRegion: 0.6, other: 0.2, noPreference: 0.5 },
  goal: { coverageShare: 0.75 },
  time: { unknown: 0.5, zeroAtMultiple: 2, impliedBudgetMinutes: 60, maxShrink: 0.4 },
  effort: { onePastLimit: 0.4, twoPastLimit: 0 },
  dataQuality: { computed: 1, estimated: 0.6, none: 0.2 },
  taste: {
    halfLifeDays: 21,
    signal: { like: 1, save: 1, cooked: 2, pass: -0.5, not_for_me: -1 },
    reasonPenalty: {
      not_my_cuisine: 1.5,
      dislike_ingredient: 2,
      dislike_unnamed_ingredient: 0.5,
      too_long: 1,
      too_heavy: 1,
    },
    ingredientShare: 0.5,
    goalTagShare: 0.5,
    clamp: 3,
    mix: { cuisine: 0.4, ingredients: 0.35, goalTags: 0.25 },
    worstIngredientShare: 0.5,
    softness: 1.5,
    heavyKcalFrom: 550,
    heavyKcalSpan: 400,
  },
  penalties: {
    recentlyShown: 0.12,
    shownHalfLifeDays: 2,
    recentlyCooked: 0.2,
    cookedHalfLifeDays: 5,
    windowDays: 21,
    dislikedIngredient: 0.12,
    dislikedAffinity: -1.5,
  },
  boosts: { novelty: 0.04, gentle: 0.03 },
  feed: {
    temperature: 0.03,
    samplePoolPerCard: 3,
    passCooldownDays: 14,
    notForMeCooldownDays: 60,
    quickMaxMinutes: 30,
    pantryMinCoverage: 0.6,
    gentlePortionScale: 0.5,
  },
  diversity: { cuisineCap: 2, regionCap: 3, window: 6, maxIngredientOverlap: 0.5 },
};

export const DEFAULT_RANKING_CONFIG = RANKING_CONFIG_V1;

/** Sum of the feature weights (1 for a valid config). */
export function weightSum(config: RankingConfig): number {
  return FEATURES.reduce((sum, name) => sum + config.weights[name], 0);
}

/** Weights as a packed array in `FEATURES` order, for the hot loop. */
export function weightVector(config: RankingConfig): Float64Array {
  const out = new Float64Array(FEATURE_COUNT);
  for (const name of FEATURES) out[F[name]] = config.weights[name];
  return out;
}
