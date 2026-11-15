/**
 * Words for the safety check of a person's own recipe, and the record of it kept with the recipe.
 */
import type {
  IngredientCheck,
  IngredientIssue,
  OwnRecipeSafety,
  OwnRecipeStatus,
} from '@/domain/ownRecipes';
import type { SafetyPrefs } from '@/domain/safety';
import { ALLERGEN_LABELS } from '@/domain/types/allergens';
import { DIET_ADJECTIVES } from '@/domain/types/diet';
import type { MyRecipeSafety } from '@/stores';

const allergen = (id: keyof typeof ALLERGEN_LABELS) => ALLERGEN_LABELS[id].toLowerCase();

/** One short phrase per issue, for the line under an ingredient. */
export function issueText(issue: IngredientIssue): string {
  switch (issue.code) {
    case 'unmatched':
      return "Famara doesn't know this ingredient";
    case 'composition_unknown':
      return 'Contents vary by brand';
    case 'allergen_unverified':
      return `May contain ${allergen(issue.allergen)}`;
    case 'diet_unverified':
      return `May not be ${DIET_ADJECTIVES[issue.diet]}`;
    case 'contains_allergen':
      return `Contains ${allergen(issue.allergen)}`;
    case 'diet_conflict':
      return `Not ${DIET_ADJECTIVES[issue.diet]}`;
  }
}

/** What to say under a line that is not plainly clear. */
export function lineNote(line: IngredientCheck): string | null {
  if (line.verdict === 'clear') return null;
  if (line.verdict === 'confirmed') return 'You checked this';
  const shown = line.verdict === 'conflict' ? line.issues.slice(0, 1) : line.issues.slice(0, 2);
  return shown.map(issueText).join(' · ');
}

export type SafetyTone = 'clear' | 'check' | 'conflict' | 'unanswered';

export interface SafetySummary {
  tone: SafetyTone;
  title: string;
  message: string;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export function safetySummary(safety: OwnRecipeSafety): SafetySummary {
  const total = safety.ingredients.length;
  if (safety.unanswered) {
    return {
      tone: 'unanswered',
      title: 'Tell us about allergies first',
      message:
        'Famara checks every ingredient against your allergies and diet. Until you answer, this recipe stays out of suggestions.',
    };
  }
  if (safety.status === 'conflict') {
    return {
      tone: 'conflict',
      title: `${safety.conflicts} ${plural(safety.conflicts, 'ingredient', 'ingredients')} not for you`,
      message:
        "This recipe has something you avoid, so it won't appear in your suggestions. You can still keep it.",
    };
  }
  if (safety.status === 'needs_check') {
    return {
      tone: 'check',
      title: `${safety.toConfirm} ${plural(safety.toConfirm, 'ingredient', 'ingredients')} to confirm`,
      message: `${safety.cleared} of ${total} ingredients checked against your allergies and diet. This recipe stays out of suggestions until you confirm the rest.`,
    };
  }
  return {
    tone: 'clear',
    title: 'Fits your allergies and diet',
    message: `All ${total} ingredients checked against your allergies and diet.`,
  };
}

/** The record kept with the recipe: the result and what it was checked against. */
export function safetySnapshot(
  safety: OwnRecipeSafety,
  prefs: SafetyPrefs,
  at: string,
): MyRecipeSafety {
  const status: OwnRecipeStatus = safety.unanswered ? 'needs_check' : safety.status;
  return {
    status,
    allergens: [...new Set(prefs.allergens ?? [])],
    diets: [...new Set(prefs.diets ?? [])],
    checkedAt: at,
  };
}
