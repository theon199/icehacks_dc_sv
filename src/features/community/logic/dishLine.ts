import { formatKcal, formatMinutes } from '@/lib/format';

import type { RecipeSummary } from '../deps';

/**
 * The quiet facts after a dish name on a post: "25 min · 473 kcal". Missing values are left out
 * rather than shown as dashes, and estimated energy says so.
 */
export function dishFacts(
  recipe: Pick<RecipeSummary, 'totalMinutes' | 'nutrition' | 'nutritionConfidence'>,
): string {
  const parts: string[] = [];
  if (recipe.totalMinutes != null && recipe.totalMinutes > 0) {
    parts.push(formatMinutes(recipe.totalMinutes));
  }
  const kcal = recipe.nutrition?.kcal;
  if (kcal != null && Number.isFinite(kcal) && recipe.nutritionConfidence !== 'none') {
    const energy = formatKcal(kcal);
    parts.push(recipe.nutritionConfidence === 'estimated' ? `${energy} (estimated)` : energy);
  }
  return parts.join(' · ');
}
