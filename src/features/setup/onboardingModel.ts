/**
 * The onboarding questionnaire as data: the steps, the draft answers, the rules for moving on and
 * how a finished draft becomes the saved preferences. Pure, so it is tested without rendering.
 */
import {
  MAX_CUISINES,
  MAX_HOUSEHOLD,
  type AllergenId,
  type DietId,
  type EffortLevel,
  type GoalId,
  type OnboardingAnswers,
} from '@/features/auth';

export const STEP_IDS = [
  'name',
  'cuisines',
  'diet',
  'allergens',
  'goals',
  'time',
  'effort',
  'household',
  'pantry',
  'appetite',
] as const;
export type StepId = (typeof STEP_IDS)[number];

/** Steps that can be skipped. Allergens can never be skipped: "none" must be said out loud. */
const OPTIONAL_STEPS: ReadonlySet<StepId> = new Set([
  'name',
  'cuisines',
  'goals',
  'time',
  'effort',
  'pantry',
]);

export function isOptional(step: StepId): boolean {
  return OPTIONAL_STEPS.has(step);
}

export interface Draft {
  displayName: string;
  cuisines: string[];
  diets: DietId[];
  allergens: AllergenId[];
  /** The explicit "I have no food allergies" answer. */
  noAllergens: boolean;
  goals: GoalId[];
  /** Null means "no limit" once `timeChosen` is true. */
  maxMinutes: number | null;
  timeChosen: boolean;
  effort: EffortLevel | null;
  householdSize: number;
  pantryStaples: string[];
  smallAppetite: boolean;
}

export const emptyDraft: Draft = {
  displayName: '',
  cuisines: [],
  diets: [],
  allergens: [],
  noAllergens: false,
  goals: [],
  maxMinutes: null,
  timeChosen: false,
  effort: null,
  householdSize: 1,
  pantryStaples: [],
  smallAppetite: false,
};

/** Starts from answers saved earlier (another device, an earlier run) so nothing is lost. */
export function draftFrom(saved: OnboardingAnswers | null, suggestedName: string | null): Draft {
  if (!saved) return { ...emptyDraft, displayName: suggestedName ?? '' };
  return {
    displayName: saved.displayName ?? suggestedName ?? '',
    cuisines: [...saved.cuisines],
    diets: [...saved.diets],
    allergens: [...saved.allergens],
    // Saved answers always went through the allergen question.
    noAllergens: saved.allergens.length === 0,
    goals: [...saved.goals],
    maxMinutes: saved.maxMinutes,
    timeChosen: true,
    effort: saved.effort,
    householdSize: saved.householdSize,
    pantryStaples: [...saved.pantryStaples],
    smallAppetite: saved.smallAppetite,
  };
}

/** Whether the current answer lets the person continue. */
export function canContinue(step: StepId, draft: Draft): boolean {
  switch (step) {
    case 'name':
      return draft.displayName.trim().length > 0;
    case 'cuisines':
      return draft.cuisines.length > 0;
    case 'allergens':
      return draft.noAllergens || draft.allergens.length > 0;
    case 'goals':
      return draft.goals.length > 0;
    case 'time':
      return draft.timeChosen;
    case 'effort':
      return draft.effort != null;
    case 'diet':
    case 'household':
    case 'pantry':
    case 'appetite':
      return true;
  }
}

/** Skipping a step leaves it unanswered, even if something was picked before skipping. */
export function skipStep(step: StepId, draft: Draft): Draft {
  switch (step) {
    case 'name':
      return { ...draft, displayName: '' };
    case 'cuisines':
      return { ...draft, cuisines: [] };
    case 'goals':
      return { ...draft, goals: [] };
    case 'time':
      return { ...draft, maxMinutes: null, timeChosen: false };
    case 'effort':
      return { ...draft, effort: null };
    case 'pantry':
      return { ...draft, pantryStaples: [] };
    default:
      return draft;
  }
}

/** Adds or removes an item, keeping order stable. */
export function toggle<T>(list: readonly T[], item: T, on: boolean): T[] {
  const without = list.filter((existing) => existing !== item);
  return on ? [...without, item] : without;
}

export function toggleCuisine(draft: Draft, id: string, on: boolean): Draft {
  if (on && !draft.cuisines.includes(id) && draft.cuisines.length >= MAX_CUISINES) return draft;
  return { ...draft, cuisines: toggle(draft.cuisines, id, on) };
}

/** Picking an allergen withdraws "none", and picking "none" clears every allergen. */
export function toggleAllergen(draft: Draft, id: AllergenId, on: boolean): Draft {
  return { ...draft, allergens: toggle(draft.allergens, id, on), noAllergens: false };
}

export function setNoAllergens(draft: Draft, on: boolean): Draft {
  return on ? { ...draft, allergens: [], noAllergens: true } : { ...draft, noAllergens: false };
}

/** Vegan already rules out everything vegetarian does, so the two are kept consistent. */
export function toggleDiet(draft: Draft, id: DietId, on: boolean): Draft {
  let diets = toggle(draft.diets, id, on);
  if (on && id === 'vegan') diets = toggle(diets, 'vegetarian', false);
  if (on && (id === 'vegetarian' || id === 'pescatarian')) diets = toggle(diets, 'vegan', false);
  if (on && id === 'vegetarian') diets = toggle(diets, 'pescatarian', false);
  if (on && id === 'pescatarian') diets = toggle(diets, 'vegetarian', false);
  return { ...draft, diets };
}

export function clampHousehold(size: number): number {
  if (!Number.isFinite(size)) return 1;
  return Math.min(MAX_HOUSEHOLD, Math.max(1, Math.round(size)));
}

/**
 * The saved form of a finished draft. Throws if the allergen question was never answered, which
 * the step rules make impossible from the UI.
 */
export function toAnswers(draft: Draft): OnboardingAnswers {
  if (!draft.noAllergens && draft.allergens.length === 0) {
    throw new Error('Allergens must be answered explicitly before onboarding can finish.');
  }
  const name = draft.displayName.trim().slice(0, 50);
  return {
    displayName: name || null,
    cuisines: draft.cuisines.slice(0, MAX_CUISINES),
    diets: [...draft.diets],
    allergens: draft.noAllergens ? [] : [...draft.allergens],
    goals: [...draft.goals],
    maxMinutes: draft.timeChosen ? draft.maxMinutes : null,
    effort: draft.effort,
    householdSize: clampHousehold(draft.householdSize),
    pantryStaples: [...draft.pantryStaples],
    smallAppetite: draft.smallAppetite,
  };
}
