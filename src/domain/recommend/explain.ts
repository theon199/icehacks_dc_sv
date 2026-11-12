/**
 * Turns a recipe's features into the two or three short reasons shown on its card ("Fits your
 * 30-minute weeknights", "High in protein for your goal"). Reasons are ranked by how much they
 * contributed to the score, so the card explains the pick rather than listing facts.
 */
import { type RankContext } from './context';
import { isNovel, pantryOwned, type FeatureVector } from './score';
import { cuisineLabel, REGION_LABELS } from '../types/cuisines';
import { GOAL_DETAILS, recipeGoalMask, type Goal } from '../types/goals';
import { type RecipeSummary } from '../types/recipe';

export type FitReasonCode =
  | 'goal'
  | 'time'
  | 'pantry'
  | 'loved_cuisine'
  | 'near_loved_cuisine'
  | 'new_cuisine'
  | 'taste'
  | 'easy'
  | 'nutrient_dense'
  | 'gentle'
  | 'energy';

export interface FitReason {
  readonly code: FitReasonCode;
  readonly text: string;
}

export type ExplainMode = 'forYou' | 'quick' | 'pantry' | 'gentle';

const GOAL_REASON: Readonly<Record<Goal, string>> = {
  more_protein: 'High in protein for your goal',
  more_fiber: 'Rich in fiber for your goal',
  lower_sodium: 'Lower in sodium, as you asked',
  heart_friendly: 'Heart-friendly, for your goal',
  lighter_meals: 'A lighter meal, for your goal',
  plant_forward: 'Plant-forward, like you wanted',
  steady_energy: 'Fiber and protein for steadier energy',
};

/** Boost that keeps the reason matching the current mode on top. */
const MODE_REASON: Readonly<Record<ExplainMode, FitReasonCode | null>> = {
  forYou: null,
  quick: 'time',
  pantry: 'pantry',
  gentle: 'gentle',
};

interface Candidate {
  code: FitReasonCode;
  text: string;
  strength: number;
}

const MAX_REASONS = 3;
const MIN_REASONS = 2;

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

/** "25 minutes", "1 hour", "2 h 30 min". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} ${plural(total, 'minute', 'minutes')}`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (rest === 0) return `${hours} ${plural(hours, 'hour', 'hours')}`;
  return `${hours} h ${rest} min`;
}

export function explainRecipe(
  recipe: RecipeSummary,
  features: FeatureVector,
  ctx: RankContext,
  mode: ExplainMode = 'forYou',
): FitReason[] {
  const w = ctx.config.weights;
  const found: Candidate[] = [];
  const push = (code: FitReasonCode, text: string, strength: number) => {
    found.push({ code, text, strength: strength + (MODE_REASON[mode] === code ? 1 : 0) });
  };

  const tagMask = recipeGoalMask(recipe.goalTags);
  const servedGoal = ctx.goals.find((goal) => tagMask & GOAL_DETAILS[goal].mask);
  if (servedGoal) push('goal', GOAL_REASON[servedGoal], w.goalMatch * features.goalMatch);

  const minutes = recipe.totalMinutes;
  const stated = ctx.prefs.timeBudgetMinutes;
  if (minutes !== null && stated !== null && minutes <= stated) {
    push('time', `Fits your ${stated}-minute weeknights`, w.timeFit);
  } else if (minutes !== null && minutes <= ctx.config.feed.quickMaxMinutes) {
    push('time', `Ready in ${formatMinutes(minutes)}`, w.timeFit * 0.5);
  }

  const owned = pantryOwned(recipe, ctx);
  if (owned >= 2 || (owned === 1 && features.pantryCoverage >= 0.5)) {
    push(
      'pantry',
      `Uses ${owned} ${plural(owned, 'thing', 'things')} in your pantry`,
      w.pantryCoverage * features.pantryCoverage + 0.01 * owned,
    );
  }

  if (ctx.loved.has(recipe.cuisine)) {
    push('loved_cuisine', `You love ${cuisineLabel(recipe.cuisine)} food`, w.cuisineMatch);
  } else if (isNovel(recipe, ctx)) {
    push(
      'new_cuisine',
      `Something new from ${REGION_LABELS[recipe.region]}`,
      ctx.config.boosts.novelty + w.cuisineMatch * features.cuisineMatch * 0.5,
    );
  } else {
    const neighbour = ctx.lovedRegions.get(recipe.region);
    if (neighbour) {
      push(
        'near_loved_cuisine',
        `Close to the ${cuisineLabel(neighbour)} food you love`,
        w.cuisineMatch * features.cuisineMatch * 0.5,
      );
    }
  }

  if (features.tasteHistory >= 0.62) {
    push('taste', "Like dishes you've enjoyed", w.tasteHistory * (features.tasteHistory - 0.5) * 2);
  }

  if (ctx.prefs.smallAppetite && recipe.gentle) {
    push('gentle', 'Gentle on a small appetite', ctx.config.boosts.gentle);
  }
  if (recipe.effort === 1) push('easy', 'Easy to make', w.effortFit * 0.25);
  if (recipe.healthScore >= 0.7) {
    push('nutrient_dense', 'Packed with nutrients', 0.05 * recipe.healthScore);
  }

  found.sort((a, b) => b.strength - a.strength);
  const reasons = found.slice(0, MAX_REASONS).map(({ code, text }) => ({ code, text }));
  if (reasons.length >= MIN_REASONS) return reasons;

  // Every card should say something; fall back to plain facts about the dish.
  if (minutes !== null && !reasons.some((r) => r.code === 'time')) {
    reasons.push({ code: 'time', text: `Ready in ${formatMinutes(minutes)}` });
  }
  const kcal = recipe.nutrition.kcal;
  if (reasons.length < MIN_REASONS && kcal !== null && kcal > 0) {
    reasons.push({ code: 'energy', text: `${Math.round(kcal)} kcal per serving` });
  }
  return reasons.slice(0, MAX_REASONS);
}
