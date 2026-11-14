/**
 * What the welcome carousel says, and which catalog recipes it shows where. Names, photos, cook
 * times and protein always come from the bundled catalog (see `welcomeRecipes.ts`); nothing here
 * is a number shown to the visitor. A recipe the catalog no longer has, or one without a photo, is
 * simply left out, so a tile shows fewer dishes rather than a made-up one.
 */
import { DietFlag, type RecipeSummary } from '@/lib/catalog';

/** A run of a headline; `accent` runs are lime. */
export interface HeadlineRun {
  text: string;
  accent?: true;
}

export type WelcomeSlideKey = 'for-you' | 'swipe' | 'ask-chef' | 'plan';

export interface WelcomeSlide {
  key: WelcomeSlideKey;
  headline: readonly HeadlineRun[];
}

export const WELCOME_SLIDES: readonly WelcomeSlide[] = [
  { key: 'for-you', headline: [{ text: 'Dinner that ' }, { text: 'fits you.', accent: true }] },
  {
    key: 'swipe',
    headline: [{ text: 'Swipe. ' }, { text: 'Save.', accent: true }, { text: ' Repeat.' }],
  },
  { key: 'ask-chef', headline: [{ text: 'Just ' }, { text: 'ask Chef.', accent: true }] },
  { key: 'plan', headline: [{ text: 'Plan it. ' }, { text: 'Share it.', accent: true }] },
];

export function headlineText(runs: readonly HeadlineRun[]): string {
  return runs.map((run) => run.text).join('');
}

/** Slide one: the four photo tiles start on the first four, then draw from the rest. */
export const FOR_YOU_POOL: readonly string[] = [
  'mealdb:53191', // Pad Thai
  'mealdb:52865', // Matar Paneer
  'mealdb:52952', // Beef Lo Mein
  'mealdb:52867', // Vegetarian Chilli
  'mealdb:52850', // Chicken Couscous
  'mealdb:53205', // Thai prawn curry
  'mealdb:52963', // Shakshuka
  'mealdb:52869', // Tahini Lentils
];

/** Slide two: the swipe stack deals from this pool in order, looping. */
export const SWIPE_POOL: readonly string[] = [
  'mealdb:52952', // Beef Lo Mein
  'mealdb:52865', // Matar Paneer
  'mealdb:53191', // Pad Thai
  'mealdb:52946', // Kung Po Prawns
  'mealdb:53266', // Falafel
  'mealdb:53248', // Salmon noodle wraps
];

/** Slide two: the "Saved" tile before the first save. */
export const SWIPE_FIRST_SAVED = 'mealdb:52963'; // Shakshuka

/**
 * Slide three: example requests and two catalog answers each. Every answer is shown only if the
 * catalog record really meets the request (`fits`), so the example can never claim a dish is
 * vegan, quick or high in protein when the catalog says otherwise.
 */
export interface ChefExample {
  prompt: string;
  answers: readonly [string, string];
  fits: (recipe: RecipeSummary) => boolean;
}

const within = (recipe: RecipeSummary, minutes: number) =>
  recipe.totalMinutes != null && recipe.totalMinutes <= minutes;
const highProtein = (recipe: RecipeSummary) => recipe.goalTags.includes('high_protein');

export const CHEF_EXAMPLES: readonly ChefExample[] = [
  {
    prompt: 'Vegan, ready in 30 minutes',
    answers: ['mealdb:52908', 'mealdb:52869'], // Ratatouille, Tahini Lentils
    fits: (recipe) => (recipe.dietFlags & DietFlag.vegan) !== 0 && within(recipe, 30),
  },
  {
    prompt: 'High protein, 30 minutes or less',
    answers: ['mealdb:52850', 'mealdb:53204'], // Chicken Couscous, Red curry chicken kebabs
    fits: (recipe) => highProtein(recipe) && within(recipe, 30),
  },
  {
    prompt: 'Seafood with plenty of protein',
    answers: ['mealdb:53248', 'mealdb:53205'], // Salmon noodle wraps, Thai prawn curry
    fits: (recipe) =>
      highProtein(recipe) &&
      (recipe.allergens.fish === 'contains' || recipe.allergens.shellfish === 'contains'),
  },
];

/** Slide four: one dish each for today, tomorrow and the day after. */
export const PLAN_MEALS: readonly [string, string, string] = [
  'mealdb:53541', // Gallo pinto
  'mealdb:53191', // Pad Thai
  'mealdb:52908', // Ratatouille
];

/** Every recipe id the carousel may show, for one catalog read. */
export const WELCOME_RECIPE_IDS: readonly string[] = [
  ...new Set([
    ...FOR_YOU_POOL,
    ...SWIPE_POOL,
    SWIPE_FIRST_SAVED,
    ...CHEF_EXAMPLES.flatMap((example) => example.answers),
    ...PLAN_MEALS,
  ]),
];

/** Timing in milliseconds. */
export const WELCOME_TIMING = {
  slideMs: 7000,
  slideFadeMs: 450,
  tileSwapMs: 2400,
  crossfadeMs: 500,
  swipeSaveAtMs: 1300,
  swipePassAtMs: 4400,
  swipeMotionMs: 950,
  savedTileAtMs: 650,
  restackAtMs: 1000,
  stampFadeMs: 150,
  typeCharMs: 38,
  caretBlinkMs: 450,
  firstAnswerDelayMs: 250,
  secondAnswerDelayMs: 550,
  secondPromptAtMs: 3600,
  heartFloatMs: 2800,
} as const;
