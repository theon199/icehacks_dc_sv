/** Words shown on, and read out for, a Discover card. */
import { cuisineLabel, type DeckCard } from '@/domain';
import { formatGrams, formatKcal, formatMinutes } from '@/lib/format';

/** "520 kcal · 32 g protein per serving", with "(estimated)" when the figures are approximate. */
export function nutritionLine(card: DeckCard): string | null {
  const { recipe } = card;
  if (recipe.nutritionConfidence === 'none') return null;
  const { kcal, proteinG } = recipe.nutrition;
  const parts: string[] = [];
  if (kcal !== null) parts.push(formatKcal(kcal));
  if (proteinG !== null) parts.push(`${formatGrams(proteinG)} protein`);
  if (parts.length === 0) return null;
  const line = `${parts.join(' · ')} per serving`;
  return recipe.nutritionConfidence === 'estimated' ? `${line} (estimated)` : line;
}

/**
 * The short stats shown as capsules on a card: time, then calories, protein and fiber per serving.
 * Estimated nutrition carries "Est." on every figure, so no number reads as more exact than it is.
 */
export function cardStats(card: DeckCard): string[] {
  const { recipe } = card;
  const stats: string[] = [];
  if (recipe.totalMinutes !== null) stats.push(formatMinutes(recipe.totalMinutes));
  if (recipe.nutritionConfidence === 'none') return stats;
  const prefix = recipe.nutritionConfidence === 'estimated' ? 'Est. ' : '';
  const { kcal, proteinG, fiberG } = recipe.nutrition;
  if (kcal !== null) stats.push(`${prefix}${formatKcal(kcal)}`);
  if (proteinG !== null) stats.push(`${prefix}${formatGrams(proteinG)} protein`);
  if (fiberG !== null) stats.push(`${prefix}${formatGrams(fiberG)} fiber`);
  return stats;
}

/** The lime chip on the card: how well the recipe fits this person, out of 100. */
export function matchText(card: DeckCard): string {
  return `${card.fitScore}% match`;
}

/** One sentence VoiceOver reads for the whole card. */
export function cardAccessibilityLabel(card: DeckCard): string {
  const { recipe } = card;
  const parts = [recipe.title, `${cuisineLabel(recipe.cuisine)} cooking`];
  if (recipe.totalMinutes !== null) parts.push(formatMinutes(recipe.totalMinutes));
  parts.push(matchText(card));
  for (const reason of card.reasons.slice(0, 2)) parts.push(reason.text);
  const nutrition = nutritionLine(card);
  if (nutrition) parts.push(nutrition);
  if (card.portionScale < 1) parts.push('Half portion suggested');
  return parts.join('. ');
}

export interface BackIngredient {
  readonly id: string;
  readonly name: string;
  /** In the person's pantry. */
  readonly onHand: boolean;
}

export interface BackIngredients {
  readonly items: readonly BackIngredient[];
  /** "3 of 7 in your pantry", or null when the pantry is empty and nothing can be claimed. */
  readonly coverage: string | null;
}

/**
 * The card back's ingredient list: the recipe's core ingredients by name, each marked when the
 * pantry holds it, in the order the recipe lists them.
 */
export function backIngredients(
  order: readonly string[],
  ingredients: readonly { readonly id: string; readonly name: string }[],
  pantry: ReadonlySet<string>,
): BackIngredients {
  const byId = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.name]));
  const items: BackIngredient[] = [];
  for (const id of order) {
    const name = byId.get(id);
    if (name !== undefined) items.push({ id, name, onHand: pantry.has(id) });
  }
  const onHand = items.filter((item) => item.onHand).length;
  const coverage =
    pantry.size === 0 || items.length === 0 ? null : `${onHand} of ${items.length} in your pantry`;
  return { items, coverage };
}
