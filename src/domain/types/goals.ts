/**
 * Health goals. People pick `Goal`s in onboarding; the catalog tags recipes with `GoalTag`s derived
 * from nutrition. `GOAL_TAGS_FOR` connects the two: a goal is served when a recipe carries any of
 * its tags.
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
  for (const tag of tags) mask |= 1 << GOAL_TAGS.indexOf(tag);
  return mask;
}

export const GOALS = [
  'more_protein',
  'more_fiber',
  'lower_sodium',
  'heart_friendly',
  'lighter_meals',
  'plant_forward',
  'steady_energy',
] as const;

export type Goal = (typeof GOALS)[number];

export const goalSchema = z.enum(GOALS);

export const GOAL_LABELS: Readonly<Record<Goal, string>> = {
  more_protein: 'More protein',
  more_fiber: 'More fiber',
  lower_sodium: 'Lower sodium',
  heart_friendly: 'Heart-friendly',
  lighter_meals: 'Lighter meals',
  plant_forward: 'Plant-forward',
  steady_energy: 'Steadier energy',
};

/** Which recipe tags count as serving each goal. Steady energy leans on fiber and protein. */
export const GOAL_TAGS_FOR: Readonly<Record<Goal, readonly GoalTag[]>> = {
  more_protein: ['high_protein'],
  more_fiber: ['high_fiber'],
  lower_sodium: ['lower_sodium'],
  heart_friendly: ['heart_friendly', 'lower_sat_fat'],
  lighter_meals: ['lower_calorie'],
  plant_forward: ['plant_forward'],
  steady_energy: ['high_fiber', 'high_protein'],
};

/** Mask of every tag that serves at least one of the goals. */
export function goalsTagMask(goals: readonly Goal[]): number {
  let mask = 0;
  for (const goal of goals) mask |= goalTagMask(GOAL_TAGS_FOR[goal]);
  return mask;
}
