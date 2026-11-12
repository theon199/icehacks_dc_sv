import { tokenize } from '../match/normalize.ts';
import type { Course, GoalTag, Nutrition } from '../types.ts';

// ---------------------------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------------------------

const DRINK = /\b(smoothies?|shakes?|milkshake|lassi|juice|lemonade|punch|iced tea|tea|latte|cocktail|mocktail|drinks?|agua fresca|horchata|hot chocolate|cider|spritzer|cordial|coffee)\b/i;
const SOUP = /\b(soups?|chowder|bisque|gazpacho|pho|ramen|minestrone|laksa|consomme|broth|borscht|caldo|sopa|potage|pozole|gumbo|harira|waterzooi)\b/i;
const SALAD = /\b(salads?|slaw|coleslaw|tabbouleh|tabouli|fattoush)\b/i;
const SAUCE = /\b(sauce|dip|salsa|dressing|oil|jam|chutney|relish|pickled?|spread|pesto|vinaigrette|marinade|seasoning|butter|syrup|gravy)\b/i;
const NOT_A_DRINK = /\b(sauce|chicken|beef|pork|fish|cakes?|cookies?|fudge|brownies?|pies?|tarts?|pudding|ice cream|truffles?|bread|muffins?|glazed?|braised)\b/i;

const MEALDB_COURSE: Record<string, Course> = {
  breakfast: 'breakfast',
  dessert: 'dessert',
  side: 'side',
  starter: 'snack',
};

/** MedlinePlus index pages in priority order. Diet listings (low-fat, vegetarian...) are ignored. */
const MEDLINEPLUS_COURSE: ReadonlyArray<readonly [string, Course]> = [
  ['drinks', 'drink'],
  // Dips, salsas and dressings are also filed under meal listings; the dish type wins.
  ['dips-salsas-and-sauces', 'snack'],
  ['soups', 'soup'],
  ['salads', 'salad'],
  ['desserts', 'dessert'],
  ['breakfast', 'breakfast'],
  ['dinner', 'main'],
  ['lunch', 'main'],
  ['side-dishes', 'side'],
  ['breads', 'side'],
  ['snacks', 'snack'],
];

export function mapCourse(source: 'mealdb' | 'medlineplus', categories: readonly string[], title: string): Course {
  if (DRINK.test(title) && !NOT_A_DRINK.test(title)) return 'drink';
  if (source === 'medlineplus') {
    for (const [category, course] of MEDLINEPLUS_COURSE) if (categories.includes(category)) return course;
    return SOUP.test(title) ? 'soup' : SALAD.test(title) ? 'salad' : 'main';
  }
  const category = (categories[0] ?? '').toLowerCase();
  if (category === 'dessert') return 'dessert';
  if (SOUP.test(title)) return 'soup';
  if (SALAD.test(title) && !/\bfruit salad\b/i.test(title)) return 'salad';
  const mapped = MEALDB_COURSE[category];
  if (mapped) return mapped;
  if (category === 'miscellaneous' && SAUCE.test(title)) return 'side';
  return 'main';
}

// ---------------------------------------------------------------------------------------------
// Time, effort, servings
// ---------------------------------------------------------------------------------------------

const round5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5);

/** Cooking time assumed when a TheMealDB recipe names no durations at all. */
const DEFAULT_COOK_MINUTES: Record<Course, number> = {
  main: 30,
  soup: 30,
  side: 20,
  dessert: 30,
  breakfast: 15,
  salad: 0,
  snack: 10,
  drink: 0,
};

export interface TimeEstimate {
  total: number;
  active: number;
}

/**
 * Estimate for sources without published times: preparation is 5 minutes plus 1.5 minutes per
 * ingredient line (capped at 40); cooking is the sum of the step timers (or a per-course default
 * when no step names a duration). Active time is preparation plus 15% of the cooking time, at
 * most 30 extra minutes (long waits such as proving or chilling are hands-off). Both are rounded
 * to 5 minutes.
 */
export function estimateTimes(lineCount: number, timerSeconds: readonly (number | null)[], course: Course): TimeEstimate {
  const prep = Math.min(40, 5 + 1.5 * lineCount);
  const timers = timerSeconds.filter((s): s is number => s !== null);
  const cook = timers.length > 0 ? timers.reduce((a, b) => a + b, 0) / 60 : DEFAULT_COOK_MINUTES[course];
  const total = round5(prep + cook);
  const active = Math.min(total, round5(prep + Math.min(30, cook * 0.15)));
  return { total, active };
}

const INVOLVED_TECHNIQUE =
  /\b(deep[- ]?fr(y|ied|ying)|knead|prove|proof|until doubled|laminat|temper|candy thermometer|sugar thermometer|blind bake|roll out|pipe|piping|souffle|wrap each|fold each|stuff each|caramel|choux|marinate overnight)\b/i;

/**
 * Effort 1 (easy) .. 3 (involved), from points: ingredient lines (>8: 1, >12: 2), steps
 * (>5: 1, >8: 2), active minutes (>25: 1, >45: 2) and any involved technique (+1).
 * 0–1 points → 1, 2–3 → 2, 4+ → 3.
 */
export function computeEffort(lineCount: number, steps: readonly string[], activeMinutes: number): 1 | 2 | 3 {
  let points = 0;
  points += lineCount > 12 ? 2 : lineCount > 8 ? 1 : 0;
  points += steps.length > 8 ? 2 : steps.length > 5 ? 1 : 0;
  points += activeMinutes > 45 ? 2 : activeMinutes > 25 ? 1 : 0;
  if (steps.some((s) => INVOLVED_TECHNIQUE.test(s))) points += 1;
  return points <= 1 ? 1 : points <= 3 ? 2 : 3;
}

/** Typical single portion by course, in grams of food (water excluded). */
export const PORTION_GRAMS: Record<Course, number> = {
  main: 400,
  soup: 450,
  salad: 250,
  side: 225,
  breakfast: 300,
  snack: 120,
  dessert: 150,
  drink: 300,
};

/** Energy bounds per serving used to keep portion estimates realistic. */
const KCAL_BOUNDS: Record<Course, readonly [number, number]> = {
  main: [250, 900],
  soup: [120, 700],
  salad: [80, 700],
  side: [60, 600],
  breakfast: [150, 800],
  snack: [60, 450],
  dessert: [120, 650],
  drink: [40, 450],
};

/** Protein per serving above which a portion estimate is treated as too large. */
const MAX_PROTEIN_PER_SERVING = 55;

/**
 * Servings when a source does not publish them: total food grams divided by a typical portion
 * for the course, then nudged so energy per serving stays within the course's bounds and protein
 * stays at or below 55 g. Clamped to 1..12; 4 when the weight of the recipe is unknown.
 */
export function estimateServings(course: Course, foodGrams: number | null, totalKcal: number | null, totalProtein: number | null = null): number {
  if (foodGrams === null || foodGrams <= 0) return 4;
  let servings = Math.round(foodGrams / PORTION_GRAMS[course]);
  servings = Math.min(12, Math.max(1, servings));
  if (totalKcal !== null && totalKcal > 0) {
    const [low, high] = KCAL_BOUNDS[course];
    while (servings < 12 && totalKcal / servings > high) servings++;
    while (servings > 1 && totalKcal / servings < low) servings--;
  }
  if (totalProtein !== null) while (servings < 12 && totalProtein / servings > MAX_PROTEIN_PER_SERVING) servings++;
  return servings;
}

// ---------------------------------------------------------------------------------------------
// Goals and gentle
// ---------------------------------------------------------------------------------------------

export interface GoalInputs {
  nutrition: Nutrition | null;
  /** Grams of food in one serving, when known. */
  servingGrams: number | null;
  course: Course;
  vegetarian: boolean;
  vegan: boolean;
  /** Share of non-water grams from produce, legumes, grains, nuts and seeds (0..1), if known. */
  plantShare: number | null;
}

/**
 * Goal tags per serving (all informational, documented in docs/data/METHODS.md):
 * - high_protein: >= 20 g protein, or >= 10 g with >= 25% of energy from protein
 * - high_fiber: >= 5.6 g fiber (20% of the 28 g Daily Value, the FDA "high" level)
 * - lower_sodium: <= 600 mg for mains and soups, <= 480 mg otherwise (FDA "healthy" limits)
 * - lower_sat_fat: < 10% of energy from saturated fat (Dietary Guidelines limit)
 * - lower_calorie: <= 120 kcal per 100 g and <= 600 kcal per serving (FDA low-calorie meal
 *   density), or <= 150 kcal per serving for sides, salads, snacks, desserts and drinks
 * - plant_forward: vegan, or vegetarian with >= 50% of food weight from plants
 * - heart_friendly: lower_sat_fat, <= 600 mg sodium, >= 2.8 g fiber (FDA "good source") and
 *   < 10% of energy from added sugars
 */
export function goalTags(input: GoalInputs): GoalTag[] {
  const tags = new Set<GoalTag>();
  const n = input.nutrition;
  if (n && n.kcal !== null && n.kcal > 0) {
    // A tag whose input is missing is not awarded: unknown is never treated as zero.
    const kcal = n.kcal;
    const protein = n.protein_g;
    const fiber = n.fiber_g;
    const sodium = n.sodium_mg;
    const sat = n.sat_fat_g;
    const added = n.added_sugar_g;
    if (protein !== null && (protein >= 20 || (protein >= 10 && (protein * 4) / kcal >= 0.25))) tags.add('high_protein');
    if (fiber !== null && fiber >= 5.6) tags.add('high_fiber');
    const sodiumLimit = input.course === 'main' || input.course === 'soup' ? 600 : 480;
    if (sodium !== null && sodium <= sodiumLimit) tags.add('lower_sodium');
    const lowerSat = sat !== null && (sat * 9) / kcal < 0.1;
    if (lowerSat) tags.add('lower_sat_fat');
    const light = ['side', 'salad', 'snack', 'dessert', 'drink'].includes(input.course) && kcal <= 150;
    const dense = input.servingGrams !== null && input.servingGrams > 0 ? (kcal / input.servingGrams) * 100 : null;
    if (light || (dense !== null && dense <= 120 && kcal <= 600)) tags.add('lower_calorie');
    if (lowerSat && sodium !== null && sodium <= 600 && fiber !== null && fiber >= 2.8 && added !== null && (added * 4) / kcal < 0.1) tags.add('heart_friendly');
  }
  if (input.vegan || (input.vegetarian && input.plantShare !== null && input.plantShare >= 0.5)) tags.add('plant_forward');
  const order: GoalTag[] = ['high_protein', 'high_fiber', 'lower_sodium', 'lower_sat_fat', 'lower_calorie', 'plant_forward', 'heart_friendly'];
  return order.filter((t) => tags.has(t));
}

const HARSH_TECHNIQUE = /\b(deep[- ]?fr(y|ied|ying)|fry until (golden and )?crisp|crispy fried|pan[- ]?fry until crisp|char(red)?|blacken(ed)?)\b/i;
const SOFT_TECHNIQUE = /\b(simmer|stew|steam|poach|mash|pur[eé]e|blend|bake|braise|slow[- ]?cook|porridge|scramble|soft|tender|creamy|smooth)\b/i;
const VERY_SPICY = /\b(spicy|fiery|hot and sour|vindaloo|scotch bonnet|habanero|ghost pepper)\b/i;

export interface GentleInputs {
  course: Course;
  kcal: number | null;
  sodiumMg: number | null;
  totalMinutes: number;
  effort: number;
  title: string;
  steps: readonly string[];
  ingredientIds: readonly string[];
}

/**
 * Small-appetite friendly: a moderate portion (150–550 kcal), sodium <= 800 mg, ready within an
 * hour at effort 1–2, soft cooking (soup, breakfast, or a step that simmers/steams/bakes/mashes),
 * no deep-frying or charring, and not billed as very spicy. Drinks are excluded.
 */
export function isGentle(input: GentleInputs): boolean {
  if (input.course === 'drink' || input.kcal === null) return false;
  if (input.kcal < 150 || input.kcal > 550) return false;
  if (input.sodiumMg !== null && input.sodiumMg > 800) return false;
  if (input.totalMinutes > 60 || input.effort > 2) return false;
  const text = `${input.title} ${input.steps.join(' ')}`;
  if (HARSH_TECHNIQUE.test(text) || VERY_SPICY.test(input.title)) return false;
  if (input.ingredientIds.includes('scotch_bonnet')) return false;
  return input.course === 'soup' || input.course === 'breakfast' || input.steps.some((s) => SOFT_TECHNIQUE.test(s));
}

// ---------------------------------------------------------------------------------------------
// Identity: slug and dish family
// ---------------------------------------------------------------------------------------------

export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** Words that describe a version of a dish rather than the dish itself. */
const VARIANT_WORDS = new Set([
  'a', 'an', 'the', 'and', 'with', 'in', 'of', 'on', 'for', 'to', 'de', 'la', 'le', 'el', 'con', 'di', 'da', 'recipe',
  'easy', 'quick', 'simple', 'healthy', 'healthier', 'classic', 'homemade', 'best', 'my', 'our', 'ultimate', 'perfect',
  'traditional', 'authentic', 'style', 'old', 'fashioned', 'mom', 'moms', 'grandma', 'grandmas', 'favorite', 'favourite',
  'baked', 'grilled', 'roasted', 'roast', 'pan', 'oven', 'slow', 'cooker', 'crockpot', 'instant', 'pot', 'one',
  'sheet', 'skillet', 'lighter', 'light', 'low', 'fat', 'sodium', 'skinny', 'mini', 'little', 'big', 'super', 'extra',
  'crispy', 'creamy', 'cheesy', 'spicy', 'fresh', 'hearty', 'simple', 'basic', 'delicious', 'yummy', 'tasty',
]);

/** Groups near-identical titles ("Easy Meatballs", "Baked Meatballs") into one dish family. */
export function familyKey(title: string): string {
  const tokens = [...new Set(tokenize(title).filter((t) => !VARIANT_WORDS.has(t) && !/^\d+$/.test(t)))].sort();
  return tokens.length > 0 ? tokens.join('-') : slugify(title);
}

// ---------------------------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------------------------

const COURSE_NOUN: Record<Course, string> = {
  main: 'main dish',
  side: 'side dish',
  soup: 'soup',
  salad: 'salad',
  breakfast: 'breakfast',
  snack: 'snack',
  dessert: 'dessert',
  drink: 'drink',
};

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const halfHours = Math.round(minutes / 30);
  const whole = Math.floor(halfHours / 2);
  const half = halfHours % 2 === 1;
  if (whole === 1 && !half) return '1 hour';
  return `${whole}${half ? '½' : ''} hours`;
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface SummaryInputs {
  cuisineLabel: string | null;
  course: Course;
  keyIngredients: readonly string[];
  totalMinutes: number;
  nutrition: Nutrition | null;
  goals: readonly GoalTag[];
}

/** Writes a factual 1–2 sentence summary from structured data only. */
export function buildSummary(input: SummaryInputs): string {
  const noun = COURSE_NOUN[input.course];
  const lead = input.cuisineLabel ? `${input.cuisineLabel} ${noun}` : noun;
  const article = /^[aeiou]/i.test(lead) ? 'An' : 'A';
  const withPart = input.keyIngredients.length > 0 ? ` with ${joinList(input.keyIngredients)}` : '';
  const first = `${article} ${lead}${withPart}, ready in about ${formatDuration(input.totalMinutes)}.`;
  const n = input.nutrition;
  if (!n || n.kcal === null) return first;
  let second: string;
  if (input.goals.includes('high_protein') && n.protein_g !== null) second = `Each serving has about ${Math.round(n.protein_g)} g of protein.`;
  else if (input.goals.includes('high_fiber') && n.fiber_g !== null) second = `Each serving has about ${Math.round(n.fiber_g)} g of fiber.`;
  else if (input.goals.includes('lower_calorie') && n.kcal <= 350) second = `Light at about ${n.kcal} kcal per serving.`;
  else if (input.goals.includes('lower_sodium') && n.sodium_mg !== null) second = `Lower in sodium at about ${n.sodium_mg} mg per serving.`;
  else if (input.goals.includes('plant_forward')) second = `Plant-forward at about ${n.kcal} kcal per serving.`;
  else second = `About ${n.kcal} kcal per serving.`;
  return `${first} ${second}`;
}
