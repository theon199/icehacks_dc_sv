/**
 * Allergen and diet safety for recipes. Fail-closed: a recipe is only eligible when every declared
 * allergen is verified `free` and every followed diet is satisfied. Missing or unverified data is
 * never read as safe.
 */
import { ALLERGEN_LABELS, type AllergenId } from '../types/allergens';
import {
  DIET_ADJECTIVES,
  dietMask,
  dietNames,
  missingDiets,
  type DietFlagName,
} from '../types/diet';
import { type UserPreferences } from '../types/preferences';
import { type RecipeSummary } from '../types/recipe';

export type SafetyPrefs = Pick<UserPreferences, 'allergens' | 'diets'>;

/** The recipe fields safety looks at. */
export type SafetyFields = Pick<RecipeSummary, 'allergens' | 'dietFlags'>;

export type SafetyReason =
  | { readonly code: 'contains_allergen'; readonly allergen: AllergenId; readonly message: string }
  | {
      readonly code: 'allergen_unverified';
      readonly allergen: AllergenId;
      readonly message: string;
    }
  | { readonly code: 'diet_mismatch'; readonly diet: DietFlagName; readonly message: string }
  | { readonly code: 'not_in_catalog'; readonly message: string };

export type SafetyReasonCode = SafetyReason['code'];

export interface SafetyVerdict {
  readonly eligible: boolean;
  /** Every reason the recipe is excluded, allergens first; empty when eligible. */
  readonly reasons: readonly SafetyReason[];
}

/** Preferences compiled once so many recipes can be checked without allocating. */
export interface SafetyRules {
  readonly allergens: readonly AllergenId[];
  readonly requiredDiets: number;
}

export function compileSafetyRules(prefs: SafetyPrefs): SafetyRules {
  return { allergens: [...new Set(prefs.allergens)], requiredDiets: dietMask(prefs.diets) };
}

function isRules(value: SafetyPrefs | SafetyRules): value is SafetyRules {
  return 'requiredDiets' in value;
}

/** Allocation-free eligibility check for hot loops. */
export function isRecipeSafe(recipe: SafetyFields, rules: SafetyRules): boolean {
  const statuses = recipe.allergens as Partial<RecipeSummary['allergens']> | undefined;
  for (const allergen of rules.allergens) {
    // Anything but a verified `free` (including a missing entry) excludes the recipe.
    if (statuses?.[allergen] !== 'free') return false;
  }
  return missingDiets(recipe.dietFlags, rules.requiredDiets) === 0;
}

const lower = (allergen: AllergenId) => ALLERGEN_LABELS[allergen].toLowerCase();

export function allergenReason(allergen: AllergenId, status: 'contains' | 'unknown'): SafetyReason {
  return status === 'contains'
    ? { code: 'contains_allergen', allergen, message: `Contains ${lower(allergen)}` }
    : {
        code: 'allergen_unverified',
        allergen,
        message: `May contain ${lower(allergen)}: ingredient data incomplete`,
      };
}

export function dietReason(diet: DietFlagName): SafetyReason {
  return { code: 'diet_mismatch', diet, message: `Not ${DIET_ADJECTIVES[diet]}` };
}

/** Full verdict with human-readable reasons, for explaining why a recipe is hidden. */
export function checkRecipe(recipe: SafetyFields, prefs: SafetyPrefs | SafetyRules): SafetyVerdict {
  const rules = isRules(prefs) ? prefs : compileSafetyRules(prefs);
  if (isRecipeSafe(recipe, rules)) return { eligible: true, reasons: [] };

  const reasons: SafetyReason[] = [];
  const statuses = recipe.allergens as Partial<RecipeSummary['allergens']> | undefined;
  for (const allergen of rules.allergens) {
    const status = statuses?.[allergen];
    if (status === 'contains') reasons.push(allergenReason(allergen, 'contains'));
    else if (status !== 'free') reasons.push(allergenReason(allergen, 'unknown'));
  }
  for (const diet of dietNames(missingDiets(recipe.dietFlags, rules.requiredDiets))) {
    reasons.push(dietReason(diet));
  }
  return { eligible: false, reasons };
}
