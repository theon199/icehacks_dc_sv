/**
 * Allergen and diet safety for recipes a person brings in themselves (a link, a card, their own
 * words). Fail-closed, like the catalog filter:
 *
 * - Every ingredient line must be matched to a catalog ingredient whose allergen data is resolved.
 *   An unmatched line, a store-bought product whose contents vary, or a line that mentions an
 *   allergen or meat word the match does not account for all make the recipe "needs a check".
 * - The person can confirm such a line ("I checked this"). A confirmation names the allergens and
 *   diets it was made against, and only counts while it covers everything they declare now, so
 *   adding an allergen later puts the line back up for a check.
 * - A known conflict (the line contains a declared allergen, or an ingredient the diet rules out)
 *   is never confirmable. It stays a conflict whatever the person confirms.
 * - Until the person has answered the allergen and diet questions nothing is clear.
 *
 * Only recipes whose status is `clear` may appear in any suggestion list.
 */
import { compileSafetyRules, DIET_ALLERGEN_CHECKS, type SafetyPrefs } from '../safety';
import { ALLERGEN_HINTS, DIET_HINTS } from './hints';
import { isPlausibleMatch, type MatchableIngredient } from './match';
import { foodWords, nameKey, tokenize } from './words';
import type { AllergenId } from '../types/allergens';
import { withImpliedDiets, DietFlag, type DietFlagName } from '../types/diet';

/** The catalog data safety reads for one matched ingredient. */
export interface CatalogFacts extends MatchableIngredient {
  /** Allergens it is known to contain. */
  readonly allergens: readonly AllergenId[];
  /** `unknown` for products whose contents vary by brand (stock cubes, curry paste). */
  readonly allergenStatus: 'resolved' | 'unknown';
  readonly dietFlags: number;
  readonly pantryStaple: boolean;
}

/** One ingredient line of a person's recipe. */
export interface OwnIngredient {
  /** The line as written, e.g. "1/3 cup cane vinegar". */
  readonly text: string;
  /** The plain ingredient, e.g. "cane vinegar". */
  readonly name: string;
  readonly catalogIngredientId: string | null;
}

/** "I checked this": made against the allergens and diets the person declared at the time. */
export interface IngredientConfirmation {
  readonly key: string;
  readonly allergens: readonly AllergenId[];
  readonly diets: readonly DietFlagName[];
  readonly at: string;
}

export type IngredientIssue =
  /** No catalog ingredient names this food. */
  | { readonly code: 'unmatched' }
  /** The catalog ingredient is a product whose contents vary. */
  | { readonly code: 'composition_unknown' }
  /** The line mentions something that may contain this allergen. */
  | { readonly code: 'allergen_unverified'; readonly allergen: AllergenId }
  /** The line may not fit this diet. */
  | { readonly code: 'diet_unverified'; readonly diet: DietFlagName }
  | { readonly code: 'contains_allergen'; readonly allergen: AllergenId }
  | { readonly code: 'diet_conflict'; readonly diet: DietFlagName };

export type IngredientIssueCode = IngredientIssue['code'];

/**
 * - `clear`: checked against the catalog, nothing to worry about.
 * - `confirmed`: the person checked it themselves; counts as clear.
 * - `needs_check`: Famara cannot tell; the person may confirm it.
 * - `conflict`: contains a declared allergen or breaks a diet; never confirmable.
 */
export type IngredientVerdict = 'clear' | 'confirmed' | 'needs_check' | 'conflict';

export interface IngredientCheck {
  readonly index: number;
  readonly key: string;
  readonly verdict: IngredientVerdict;
  /** Conflicts first. Empty when the catalog clears the line. */
  readonly issues: readonly IngredientIssue[];
  /** The catalog ingredient the line was checked against, or null when unmatched. */
  readonly catalog: CatalogFacts | null;
}

export type OwnRecipeStatus = 'clear' | 'needs_check' | 'conflict';

export interface OwnRecipeSafety {
  readonly status: OwnRecipeStatus;
  /** True while the allergen and diet questions are unanswered: nothing can be clear then. */
  readonly unanswered: boolean;
  readonly ingredients: readonly IngredientCheck[];
  /** Lines the person could confirm. */
  readonly toConfirm: number;
  readonly conflicts: number;
  /** Lines that count as clear (`clear` or `confirmed`). */
  readonly cleared: number;
}

export interface OwnRecipeCheckInput {
  readonly ingredients: readonly OwnIngredient[];
  /** Catalog facts by ingredient id. An id missing here reads as unmatched. */
  readonly catalog: ReadonlyMap<string, CatalogFacts>;
  readonly prefs: SafetyPrefs;
  readonly confirmations: readonly IngredientConfirmation[];
}

/** Identifies a line for confirmations; editing the line (or its name) makes a new key. */
export function ingredientKey(ingredient: Pick<OwnIngredient, 'text' | 'name'>): string {
  return `${nameKey(ingredient.name)}|${tokenize(ingredient.text).join(' ')}`.slice(0, 300);
}

interface Declared {
  readonly allergens: readonly AllergenId[];
  readonly diets: readonly DietFlagName[];
}

function hasDiet(flags: number, diet: DietFlagName): boolean {
  return (withImpliedDiets(flags) & DietFlag[diet]) !== 0;
}

/** Words of the line the catalog match does not account for. */
function unexplainedWords(ingredient: OwnIngredient, catalog: CatalogFacts | null): Set<string> {
  const words = new Set([...foodWords(ingredient.text), ...foodWords(ingredient.name)]);
  if (catalog) {
    for (const name of [catalog.name, catalog.plural, catalog.id.replace(/_/g, ' ')]) {
      if (name) for (const word of foodWords(name)) words.delete(word);
    }
  }
  return words;
}

const mentions = (words: ReadonlySet<string>, hints: readonly string[]) =>
  hints.some((hint) => words.has(hint));

/** The line's issues for the declared allergens and diets, conflicts first. */
export function ingredientIssues(
  ingredient: OwnIngredient,
  catalog: CatalogFacts | null,
  declared: Declared,
): IngredientIssue[] {
  const conflicts: IngredientIssue[] = [];
  const unsure: IngredientIssue[] = [];
  if (!catalog) unsure.push({ code: 'unmatched' });
  else if (catalog.allergenStatus !== 'resolved') unsure.push({ code: 'composition_unknown' });
  const contains = new Set(catalog?.allergens ?? []);
  const resolved = catalog?.allergenStatus === 'resolved';
  const words = unexplainedWords(ingredient, catalog);
  // An allergen is clear only when the line is matched, the match is resolved and does not hold
  // it, and nothing else on the line hints at it.
  const allergenState = (allergen: AllergenId): 'contains' | 'unknown' | 'free' => {
    if (contains.has(allergen)) return 'contains';
    if (!resolved || mentions(words, ALLERGEN_HINTS[allergen])) return 'unknown';
    return 'free';
  };

  for (const allergen of declared.allergens) {
    const state = allergenState(allergen);
    if (state === 'contains') conflicts.push({ code: 'contains_allergen', allergen });
    else if (state === 'unknown') unsure.push({ code: 'allergen_unverified', allergen });
  }
  for (const diet of declared.diets) {
    const checks = DIET_ALLERGEN_CHECKS[diet] ?? [];
    const states = checks.map(allergenState);
    // A resolved ingredient without the diet's bit is known not to fit; one whose contents vary
    // may still fit, so it is only unproven.
    const bitMissing = catalog !== null && !hasDiet(catalog.dietFlags, diet);
    if (states.includes('contains') || (bitMissing && resolved)) {
      conflicts.push({ code: 'diet_conflict', diet });
    } else if (
      !catalog ||
      bitMissing ||
      states.includes('unknown') ||
      mentions(words, DIET_HINTS[diet])
    ) {
      unsure.push({ code: 'diet_unverified', diet });
    }
  }
  return [...conflicts, ...unsure];
}

const covers = <T>(made: readonly T[], needed: readonly T[]) =>
  needed.every((item) => made.includes(item));

/** Whether a confirmation still vouches for a line under the person's current declarations. */
export function confirmationCovers(
  confirmation: IngredientConfirmation,
  key: string,
  declared: Declared,
): boolean {
  return (
    confirmation.key === key &&
    covers(confirmation.allergens, declared.allergens) &&
    covers(confirmation.diets, declared.diets)
  );
}

function verdictOf(
  issues: readonly IngredientIssue[],
  confirmed: boolean,
  answered: boolean,
): IngredientVerdict {
  if (issues.some((issue) => issue.code === 'contains_allergen' || issue.code === 'diet_conflict'))
    return 'conflict';
  if (!answered) return 'needs_check';
  if (issues.length === 0) return 'clear';
  return confirmed ? 'confirmed' : 'needs_check';
}

/** The catalog facts for a line, or null when the stored id is missing or no longer plausible. */
function factsFor(
  ingredient: OwnIngredient,
  catalog: ReadonlyMap<string, CatalogFacts>,
): CatalogFacts | null {
  if (ingredient.catalogIngredientId === null) return null;
  const facts = catalog.get(ingredient.catalogIngredientId);
  return facts && isPlausibleMatch(ingredient.name, facts) ? facts : null;
}

export function checkOwnRecipe(input: OwnRecipeCheckInput): OwnRecipeSafety {
  const rules = compileSafetyRules(input.prefs);
  const declared: Declared = {
    allergens: rules.allergens,
    diets: rules.answered ? [...new Set(input.prefs.diets ?? [])] : [],
  };
  const ingredients = input.ingredients.map((ingredient, index): IngredientCheck => {
    const catalog = factsFor(ingredient, input.catalog);
    const key = ingredientKey(ingredient);
    const issues = ingredientIssues(ingredient, catalog, declared);
    const confirmed =
      rules.answered &&
      input.confirmations.some((confirmation) => confirmationCovers(confirmation, key, declared));
    return { index, key, verdict: verdictOf(issues, confirmed, rules.answered), issues, catalog };
  });
  const conflicts = ingredients.filter((line) => line.verdict === 'conflict').length;
  const toConfirm = rules.answered
    ? ingredients.filter((line) => line.verdict === 'needs_check').length
    : 0;
  const cleared = ingredients.filter(
    (line) => line.verdict === 'clear' || line.verdict === 'confirmed',
  ).length;
  const allClear = ingredients.length > 0 && cleared === ingredients.length;
  const status: OwnRecipeStatus =
    conflicts > 0 ? 'conflict' : rules.answered && allClear ? 'clear' : 'needs_check';
  return { status, unanswered: !rules.answered, ingredients, toConfirm, conflicts, cleared };
}

/** The only gate for suggestion lists. */
export function isClearedForSuggestions(safety: OwnRecipeSafety): boolean {
  return safety.status === 'clear' && !safety.unanswered;
}

/**
 * Records "I checked this" for a line under the person's current declarations, replacing any
 * older confirmation of it. Returns null while the safety questions are unanswered: there is
 * nothing to check against yet. Confirming a conflict has no effect (see `checkOwnRecipe`).
 */
export function confirmIngredient(
  confirmations: readonly IngredientConfirmation[],
  key: string,
  prefs: SafetyPrefs,
  at: string,
): IngredientConfirmation[] | null {
  if (prefs.allergens === null || prefs.diets === null) return null;
  const next: IngredientConfirmation = {
    key,
    allergens: [...new Set(prefs.allergens)],
    diets: [...new Set(prefs.diets)],
    at,
  };
  return [...confirmations.filter((confirmation) => confirmation.key !== key), next];
}

/** Takes back a confirmation. */
export function unconfirmIngredient(
  confirmations: readonly IngredientConfirmation[],
  key: string,
): IngredientConfirmation[] {
  return confirmations.filter((confirmation) => confirmation.key !== key);
}

/** Drops confirmations for lines that are no longer in the recipe (edited or removed). */
export function pruneConfirmations(
  confirmations: readonly IngredientConfirmation[],
  ingredients: readonly Pick<OwnIngredient, 'text' | 'name'>[],
): IngredientConfirmation[] {
  const keys = new Set(ingredients.map(ingredientKey));
  return confirmations.filter((confirmation) => keys.has(confirmation.key));
}
