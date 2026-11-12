/**
 * Health goals. People pick goals in onboarding; the catalog tags recipes with `GoalTag`s derived
 * from nutrition. `GOAL_DETAILS` connects the two: a goal is served when a recipe carries any of
 * the tags listed for it.
 */
import { z } from 'zod';

import { jsonText } from './json';

export const GOAL_TAGS = [
  'high_protein',
  'high_fiber',
  'lower_sodium',
  'lower_sat_fat',
  'lower_calorie',
  'plant_forward',
  'heart_friendly',
] as const;

export type GoalTag = (typeof GOAL_TAGS)[number];

export const goalTagSchema = z.enum(GOAL_TAGS);

/**
 * Recipe goal tags from the catalog. Unknown tags from a newer catalog are dropped rather than
 * failing the whole row.
 */
export const goalTagListSchema = z.array(z.string()).transform((tags): GoalTag[] => {
  const out: GoalTag[] = [];
  for (const tag of tags) {
    if (isGoalTag(tag) && !out.includes(tag)) out.push(tag);
  }
  return out;
});

export const goalTagListJsonSchema = jsonText(goalTagListSchema);

export function isGoalTag(value: unknown): value is GoalTag {
  return typeof value === 'string' && (GOAL_TAGS as readonly string[]).includes(value);
}

/** One bit per goal tag, in `GOAL_TAGS` order; used by the ranking hot loop. */
export function goalTagMask(tags: readonly GoalTag[]): number {
  let mask = 0;
  for (let i = 0; i < tags.length; i++) {
    const bit = GOAL_TAGS.indexOf(tags[i]!);
    if (bit >= 0) mask |= 1 << bit;
  }
  return mask;
}

const recipeMasks = new WeakMap<readonly GoalTag[], number>();

/**
 * `goalTagMask` memoised by array identity. Catalog recipes live for the whole session, so each
 * recipe's mask is computed once no matter how many decks rank it.
 */
export function recipeGoalMask(tags: readonly GoalTag[]): number {
  let mask = recipeMasks.get(tags);
  if (mask === undefined) {
    mask = goalTagMask(tags);
    recipeMasks.set(tags, mask);
  }
  return mask;
}

/**
 * Validates a person's goal ids (onboarding order). The schema is the source of truth for the
 * vocabulary; the `Goal` type and the id list are read from it.
 */
export const goalIdSchema = z.enum([
  'more_protein',
  'more_fiber',
  'lower_sodium',
  'heart_friendly',
  'lighter_meals',
  'plant_forward',
  'steady_energy',
]);

export type Goal = z.infer<typeof goalIdSchema>;

export const GOAL_IDS: readonly Goal[] = goalIdSchema.options;

export interface GoalDetail {
  /** Chip text in onboarding and Preferences. */
  readonly label: string;
  /** Recipe tags that count as serving the goal; any one of them is enough. */
  readonly servedBy: readonly GoalTag[];
  /** `servedBy` as a tag bitmask (see `goalTagMask`). */
  readonly mask: number;
}

function detail(label: string, servedBy: readonly GoalTag[]): GoalDetail {
  return { label, servedBy, mask: goalTagMask(servedBy) };
}

/** Label and serving tags per goal. Steadier energy leans on fiber and protein together. */
export const GOAL_DETAILS: Readonly<Record<Goal, GoalDetail>> = {
  more_protein: detail('More protein', ['high_protein']),
  more_fiber: detail('More fiber', ['high_fiber']),
  lower_sodium: detail('Less salt', ['lower_sodium']),
  heart_friendly: detail('Heart-friendly', ['heart_friendly', 'lower_sat_fat']),
  lighter_meals: detail('Lighter meals', ['lower_calorie']),
  plant_forward: detail('Plant-forward', ['plant_forward']),
  steady_energy: detail('Steadier energy', ['high_fiber', 'high_protein']),
};

/** Mask of every tag that serves at least one of the goals. */
export function goalsTagMask(goals: readonly Goal[]): number {
  let mask = 0;
  for (const goal of goals) mask |= GOAL_DETAILS[goal].mask;
  return mask;
}
