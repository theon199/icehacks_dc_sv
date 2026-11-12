/**
 * Allergen and diet safety for recipes. Fail-closed: a recipe is only eligible when every declared
 * allergen is verified `free` and every followed diet is satisfied. Missing or unverified data is
 * never read as safe, and neither are preferences whose safety answers are missing.
 *
 * Diet bits from the catalog are cross-checked against allergen statuses for the diets an allergen
 * can disprove: a recipe flagged vegan whose milk status is `unknown` is not shown to vegans.
 */
import { ALLERGEN_LABELS, type AllergenId } from '../types/allergens';
import {
  DIET_ADJECTIVES,
  DietFlag,
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
  | { readonly code: 'diet_unverified'; readonly diet: DietFlagName; readonly message: string }
  | { readonly code: 'preferences_unanswered'; readonly message: string }
  | { readonly code: 'not_in_catalog'; readonly message: string };

export type SafetyReasonCode = SafetyReason['code'];

export interface SafetyVerdict {
  readonly eligible: boolean;
  /** Every reason the recipe is excluded, allergens first; empty when eligible. */
  readonly reasons: readonly SafetyReason[];
}

/**
 * Allergens that must be verified `free` before a recipe's diet bit is believed. Only diets an
 * allergen status can disprove are listed; the others rely on the catalog bit alone.
 */
export const DIET_ALLERGEN_CHECKS: Readonly<Partial<Record<DietFlagName, readonly AllergenId[]>>> =
  {
    vegan: ['milk', 'egg', 'fish', 'shellfish'],
    dairy_free: ['milk'],
    gluten_free: ['gluten', 'wheat'],
  };

/** Preferences compiled once so many recipes can be checked without allocating. */
export interface SafetyRules {
  /** False until the person has answered the allergen and diet questions; nothing is safe then. */
  readonly answered: boolean;
  readonly allergens: readonly AllergenId[];
  readonly requiredDiets: number;
  /** Declared allergens plus those the followed diets need verified, without duplicates. */
  readonly mustBeFree: readonly AllergenId[];
}

export function compileSafetyRules(prefs: SafetyPrefs): SafetyRules {
  if (prefs.allergens === null || prefs.diets === null) {
    return { answered: false, allergens: [], requiredDiets: 0, mustBeFree: [] };
  }
  const allergens = [...new Set(prefs.allergens)];
  const mustBeFree = new Set(allergens);
  for (const diet of prefs.diets) {
    for (const allergen of DIET_ALLERGEN_CHECKS[diet] ?? []) mustBeFree.add(allergen);
  }
  return {
    answered: true,
    allergens,
    requiredDiets: dietMask(prefs.diets),
    mustBeFree: [...mustBeFree],
  };
}

function isRules(value: SafetyPrefs | SafetyRules): value is SafetyRules {
  return 'requiredDiets' in value;
}

/** Allocation-free eligibility check for hot loops. */
export function isRecipeSafe(recipe: SafetyFields, rules: SafetyRules): boolean {
  if (!rules.answered) return false;
  const statuses = recipe.allergens as Partial<RecipeSummary['allergens']> | undefined;
  const required = rules.mustBeFree;
  for (let i = 0; i < required.length; i++) {
    // Anything but a verified `free` (including a missing entry) excludes the recipe.
    if (statuses?.[required[i]!] !== 'free') return false;
  }
  return missingDiets(recipe.dietFlags, rules.requiredDiets) === 0;
}

const UNANSWERED: SafetyReason = {
  code: 'preferences_unanswered',
  message: 'Tell us about allergies and diets to see recipes',
};

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

/** The recipe is flagged for the diet, but an allergen that would disprove it is not verified. */
export function dietUnverifiedReason(diet: DietFlagName): SafetyReason {
  return {
    code: 'diet_unverified',
    diet,
    message: `May not be ${DIET_ADJECTIVES[diet]}: ingredient data incomplete`,
  };
}

/** Full verdict with human-readable reasons, for explaining why a recipe is hidden. */
export function checkRecipe(recipe: SafetyFields, prefs: SafetyPrefs | SafetyRules): SafetyVerdict {
  const rules = isRules(prefs) ? prefs : compileSafetyRules(prefs);
  if (isRecipeSafe(recipe, rules)) return { eligible: true, reasons: [] };
  if (!rules.answered) return { eligible: false, reasons: [UNANSWERED] };

  const reasons: SafetyReason[] = [];
  const statuses = recipe.allergens as Partial<RecipeSummary['allergens']> | undefined;
  for (const allergen of rules.allergens) {
    const status = statuses?.[allergen];
    if (status === 'contains') reasons.push(allergenReason(allergen, 'contains'));
    else if (status !== 'free') reasons.push(allergenReason(allergen, 'unknown'));
  }
  const missing = missingDiets(recipe.dietFlags, rules.requiredDiets);
  for (const diet of dietNames(rules.requiredDiets)) {
    if (missing & DietFlag[diet]) {
      reasons.push(dietReason(diet));
      continue;
    }
    const checks = DIET_ALLERGEN_CHECKS[diet] ?? [];
    // A `contains` here contradicts the diet bit outright; `unknown` leaves it unproven.
    if (checks.some((allergen) => statuses?.[allergen] === 'contains'))
      reasons.push(dietReason(diet));
    else if (checks.some((allergen) => statuses?.[allergen] !== 'free')) {
      reasons.push(dietUnverifiedReason(diet));
    }
  }
  return { eligible: false, reasons };
}
