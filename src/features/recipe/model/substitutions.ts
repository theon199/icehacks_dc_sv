/**
 * Which catalog swaps to suggest on an ingredient line. Only swaps that matter to this person are
 * shown: ones that avoid an allergen they declared, fit a diet they follow, or serve one of their
 * health goals. A swap is never suggested when its replacement could itself be unsafe for them:
 * replacements with unverified allergen data are dropped whenever allergens are in play.
 */
import {
  ALLERGEN_LABELS,
  DIET_LABELS,
  DietFlag,
  GOAL_DETAILS,
  missingDiets,
  type AllergenId,
  type DietFlagName,
  type Goal,
  type UserPreferences,
} from '@/domain';
import type { Ingredient, Substitution } from '@/lib/catalog';

export type SuggestionReason =
  /** `allergens` is empty when the original's allergen data is unverified. */
  | { readonly kind: 'allergen'; readonly allergens: readonly AllergenId[] }
  | { readonly kind: 'diet'; readonly diets: readonly DietFlagName[] }
  | { readonly kind: 'goal'; readonly goal: Goal };

export interface SubstitutionSuggestion {
  readonly fromId: string;
  readonly toId: string;
  /** Display name of the replacement. */
  readonly toName: string;
  readonly ratio: number;
  readonly note: string;
  readonly reason: SuggestionReason;
  /** Short plain-language label, e.g. "Avoids milk", "Fits vegan", "For more fiber". */
  readonly label: string;
}

export const MAX_SUGGESTIONS_PER_LINE = 2;

type IngredientFacts = Pick<Ingredient, 'name' | 'allergens' | 'allergenStatus' | 'dietFlags'>;

const GOAL_LABEL: Readonly<Record<Goal, string>> = {
  more_protein: 'For more protein',
  more_fiber: 'For more fiber',
  lower_sodium: 'For less salt',
  heart_friendly: 'Heart-friendly swap',
  lighter_meals: 'A lighter swap',
  plant_forward: 'More plant-forward',
  steady_energy: 'For steadier energy',
};

function listLabel(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Declared allergens the ingredient contains. `null` means none apply; an empty list means the
 * ingredient's allergen data is unverified, so any verified-safe swap is worth offering.
 */
function allergenConflicts(
  ingredient: IngredientFacts | undefined,
  allergens: readonly AllergenId[],
): AllergenId[] | null {
  if (!ingredient || allergens.length === 0) return null;
  if (ingredient.allergenStatus !== 'resolved') return [];
  const found = allergens.filter((allergen) => ingredient.allergens.includes(allergen));
  return found.length > 0 ? found : null;
}

/**
 * A replacement is only offered when it is verified safe for every declared allergen. Before the
 * person has answered the allergen questions any allergen could matter to them, so only a
 * replacement verified free of every allergen qualifies (the same rule Compare applies).
 */
function safeReplacement(
  replacement: IngredientFacts | undefined,
  prefs: Pick<UserPreferences, 'allergens' | 'diets'>,
): replacement is IngredientFacts {
  if (!replacement) return false;
  if (replacement.allergenStatus !== 'resolved') return false;
  if (prefs.allergens === null) {
    if (replacement.allergens.length > 0) return false;
  } else if (prefs.allergens.some((a) => replacement.allergens.includes(a))) {
    return false;
  }
  const diets = prefs.diets ?? [];
  return diets.every((diet) => missingDiets(replacement.dietFlags, DietFlag[diet]) === 0);
}

function reasonFor(
  sub: Substitution,
  original: IngredientFacts | undefined,
  replacement: IngredientFacts,
  prefs: Pick<UserPreferences, 'allergens' | 'diets' | 'goals'>,
): SuggestionReason | null {
  if (sub.goal === 'allergen') {
    const conflicts = allergenConflicts(original, prefs.allergens ?? []);
    return conflicts ? { kind: 'allergen', allergens: conflicts } : null;
  }
  if (sub.goal === 'diet') {
    if (!original) return null;
    const broken = (prefs.diets ?? []).filter(
      (diet) =>
        missingDiets(original.dietFlags, DietFlag[diet]) !== 0 &&
        missingDiets(replacement.dietFlags, DietFlag[diet]) === 0,
    );
    return broken.length > 0 ? { kind: 'diet', diets: broken } : null;
  }
  const goalTag = sub.goal;
  const goal = prefs.goals.find((g) => GOAL_DETAILS[g].servedBy.includes(goalTag));
  return goal ? { kind: 'goal', goal } : null;
}

function labelFor(reason: SuggestionReason): string {
  switch (reason.kind) {
    case 'allergen':
      if (reason.allergens.length === 0) return 'Verified allergen-safe swap';
      return `Avoids ${listLabel(reason.allergens.map((a) => ALLERGEN_LABELS[a].toLowerCase()))}`;
    case 'diet':
      return `Fits ${listLabel(reason.diets.map((d) => DIET_LABELS[d].toLowerCase()))}`;
    case 'goal':
      return GOAL_LABEL[reason.goal];
  }
}

const REASON_ORDER: Readonly<Record<SuggestionReason['kind'], number>> = {
  allergen: 0,
  diet: 1,
  goal: 2,
};

/**
 * Suggestions per original ingredient id, most important first (allergen, then diet, then goals
 * in the person's order), at most `MAX_SUGGESTIONS_PER_LINE` each and one per replacement.
 */
export function suggestSubstitutions(
  subs: readonly Substitution[],
  ingredients: ReadonlyMap<string, IngredientFacts>,
  prefs: Pick<UserPreferences, 'allergens' | 'diets' | 'goals'>,
): Map<string, SubstitutionSuggestion[]> {
  const byLine = new Map<string, SubstitutionSuggestion[]>();
  for (const sub of subs) {
    // A swap without a usable amount would read as 1 for 1 and could mislead; leave it out.
    if (sub.fromId === sub.toId || !isUsableRatio(sub.ratio)) continue;
    const replacement = ingredients.get(sub.toId);
    if (!safeReplacement(replacement, prefs)) continue;
    const reason = reasonFor(sub, ingredients.get(sub.fromId), replacement, prefs);
    if (!reason) continue;
    const list = byLine.get(sub.fromId) ?? [];
    list.push({
      fromId: sub.fromId,
      toId: sub.toId,
      toName: replacement.name,
      ratio: sub.ratio,
      note: sub.note,
      reason,
      label: labelFor(reason),
    });
    byLine.set(sub.fromId, list);
  }
  const rank = (s: SubstitutionSuggestion) =>
    REASON_ORDER[s.reason.kind] * 100 +
    (s.reason.kind === 'goal' ? prefs.goals.indexOf(s.reason.goal) : 0);
  for (const [fromId, list] of byLine) {
    const seen = new Set<string>();
    const kept = list
      .sort((a, b) => rank(a) - rank(b) || a.toName.localeCompare(b.toName))
      .filter((s) => (seen.has(s.toId) ? false : (seen.add(s.toId), true)))
      .slice(0, MAX_SUGGESTIONS_PER_LINE);
    byLine.set(fromId, kept);
  }
  return byLine;
}

/** A ratio a swap can be followed with: a positive, finite multiple of the original amount. */
export function isUsableRatio(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio > 0;
}

/**
 * "Swap 1 for 1", "Use twice as much", "Use half as much", otherwise "Use 75% of the amount".
 * Only meaningful for a usable ratio; suggestions with any other ratio are never made.
 */
export function ratioLabel(ratio: number): string {
  if (Math.abs(ratio - 1) < 0.01) return 'Swap 1 for 1';
  if (Math.abs(ratio - 2) < 0.01) return 'Use twice as much';
  if (Math.abs(ratio - 0.5) < 0.01) return 'Use half as much';
  const percent = Math.round(ratio * 100);
  return `Use ${percent}% of the amount`;
}
