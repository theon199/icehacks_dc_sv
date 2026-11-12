/**
 * The "Why this fits you" breakdown: each ranking feature turned into one plain sentence, how well
 * the recipe does on it, and how many of the fit score's points it earned. Points add up to the
 * fit score shown on the recipe (rounding aside), so the sheet explains the number rather than
 * listing loosely related facts.
 */
import {
  cuisineLabel,
  FEATURES,
  formatMinutes,
  GOAL_DETAILS,
  recipeGoalMask,
  type FeatureName,
  type Goal,
  type RankContext,
  type RecipeScore,
  type RecipeSummary,
} from '@/domain';

export type FitLevel = 'strong' | 'partial' | 'weak' | 'neutral';

export interface FitFactor {
  readonly feature: FeatureName;
  readonly title: string;
  readonly detail: string;
  /** 0..1 how well the recipe does on this factor. */
  readonly value: number;
  readonly level: FitLevel;
  /** Fit-score points earned and the most this factor can earn. */
  readonly points: number;
  readonly maxPoints: number;
}

const TITLES: Readonly<Record<FeatureName, string>> = {
  cuisineMatch: 'Cuisine',
  goalMatch: 'Your health goals',
  timeFit: 'Cooking time',
  effortFit: 'Effort',
  pantryCoverage: 'Your pantry',
  tasteHistory: 'Your taste',
  dataQuality: 'Nutrition data',
};

function level(value: number): FitLevel {
  if (value >= 0.75) return 'strong';
  if (value >= 0.4) return 'partial';
  return 'weak';
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const EFFORT_PHRASE = {
  1: 'An easy recipe',
  2: 'A moderate-effort recipe',
  3: 'An involved recipe',
} as const;

type Explained = { detail: string; level?: FitLevel };

function explainFeature(
  feature: FeatureName,
  value: number,
  recipe: RecipeSummary,
  ctx: RankContext,
): Explained {
  switch (feature) {
    case 'cuisineMatch': {
      const name = cuisineLabel(recipe.cuisine);
      if (ctx.loved.size === 0) {
        return {
          detail: `${name} cooking. You haven't picked favourite cuisines, so every cuisine counts the same.`,
          level: 'neutral',
        };
      }
      if (ctx.loved.has(recipe.cuisine)) return { detail: `You love ${name} food.` };
      const neighbour = ctx.lovedRegions.get(recipe.region);
      if (neighbour) {
        return {
          detail: `${name} cooking, close to the ${cuisineLabel(neighbour)} food you love.`,
        };
      }
      return { detail: `${name} cooking is outside the cuisines you picked.` };
    }
    case 'goalMatch': {
      const health = Math.round(recipe.healthScore * 100);
      if (ctx.goals.length === 0) {
        return {
          detail: `No health goals chosen, so this reflects how nutrient-dense the dish is (${health} out of 100).`,
        };
      }
      const mask = recipeGoalMask(recipe.goalTags);
      const served = ctx.goals.filter((goal) => mask & GOAL_DETAILS[goal].mask);
      const label = (goals: readonly Goal[]) =>
        listOf(goals.map((goal) => GOAL_DETAILS[goal].label.toLowerCase()));
      if (served.length === 0) {
        return {
          detail: `Doesn't stand out for ${label(ctx.goals)}. Nutrient density: ${health} out of 100.`,
        };
      }
      const missed = ctx.goals.filter((goal) => !served.includes(goal));
      return {
        detail:
          missed.length === 0
            ? `Fits every goal you chose: ${label(served)}.`
            : `Fits ${label(served)}, but not ${label(missed)}.`,
      };
    }
    case 'timeFit': {
      const minutes = recipe.totalMinutes;
      const budget = ctx.timeBudget;
      if (budget === null) {
        return {
          detail:
            minutes === null
              ? 'No time limit set, and the recipe does not list a time.'
              : `Takes ${formatMinutes(minutes)}. You haven't set a time limit.`,
          level: 'neutral',
        };
      }
      const limit = Math.round(budget);
      if (minutes === null) return { detail: "The recipe doesn't list a cooking time." };
      if (minutes <= budget) {
        return { detail: `Ready in ${formatMinutes(minutes)}, within your ${limit} minutes.` };
      }
      return { detail: `Takes ${formatMinutes(minutes)}, longer than your ${limit} minutes.` };
    }
    case 'effortFit': {
      const phrase = EFFORT_PHRASE[recipe.effort];
      return value >= 1
        ? { detail: `${phrase}, within the effort you like.` }
        : { detail: `${phrase}, more than you usually like to take on.` };
    }
    case 'pantryCoverage': {
      const total = recipe.coreIngredientIds.length;
      if (ctx.pantry.size === 0) {
        return {
          detail: 'Add what you have at home to your pantry to see how much you can use up.',
          level: 'neutral',
        };
      }
      if (total === 0) return { detail: 'No main ingredients to match.', level: 'neutral' };
      const owned = recipe.coreIngredientIds.filter((id) => ctx.pantry.has(id)).length;
      return { detail: `You have ${owned} of its ${total} main ingredients.` };
    }
    case 'tasteHistory': {
      if (ctx.taste.empty || Math.abs(value - 0.5) < 0.05) {
        return {
          detail: 'Not enough likes, saves and cooks yet to learn your taste.',
          level: 'neutral',
        };
      }
      return value > 0.5
        ? { detail: "Similar to dishes you've liked, saved or cooked." }
        : { detail: "Less like the dishes you've enjoyed so far." };
    }
    case 'dataQuality': {
      if (recipe.nutritionConfidence === 'computed') {
        return { detail: 'Nutrition calculated from USDA data for every ingredient.' };
      }
      if (recipe.nutritionConfidence === 'estimated') {
        return { detail: 'Nutrition partly estimated, so we are a little less sure of it.' };
      }
      return { detail: 'No reliable nutrition data, so health claims are held back.' };
    }
  }
}

/** Every factor in ranking order, with the person-facing explanation. */
export function fitBreakdown(
  recipe: RecipeSummary,
  score: RecipeScore,
  ctx: RankContext,
): FitFactor[] {
  const weights = ctx.config.weights;
  return FEATURES.map((feature) => {
    const value = Math.min(1, Math.max(0, score.features[feature]));
    const explained = explainFeature(feature, value, recipe, ctx);
    return {
      feature,
      title: TITLES[feature],
      detail: explained.detail,
      value,
      level: explained.level ?? level(value),
      points: Math.round(weights[feature] * value * 100),
      maxPoints: Math.round(weights[feature] * 100),
    };
  }).sort((a, b) => b.maxPoints - a.maxPoints);
}

/** "Great fit", "Good fit", ... for the score ring. */
export function fitLabel(fitScore: number): string {
  if (fitScore >= 80) return 'Great fit';
  if (fitScore >= 65) return 'Good fit';
  if (fitScore >= 45) return 'Okay fit';
  return 'Not your usual';
}
