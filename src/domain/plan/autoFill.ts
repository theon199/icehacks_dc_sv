/**
 * "Plan my week": fill empty planner cells from a ranked list of candidate recipes.
 *
 * The caller passes candidates already scored by the recommender. This module only arranges them:
 * it walks the week day by day, slot by slot, and for each empty cell takes the best eligible
 * candidate by an adjusted score. Hard rules:
 * - the recipe's course must suit the slot;
 * - its total time must fit that weekday's per-meal time budget (unknown times are allowed but
 *   ranked lower);
 * - no recipe appears twice in the week (cells already planned count);
 * - no cuisine appears more than twice in any three consecutive days.
 * If the cuisine rule leaves a cell empty it is relaxed for that cell only, and the result says so.
 * The other rules are never relaxed; a cell with no eligible recipe stays empty.
 *
 * Adjusted score = recommender score
 *   + goal bonus (per matching goal tag, capped)
 *   + pantry bonus (share of the recipe's non-staple ingredients already in the pantry)
 *   + reuse bonus (share of its ingredients already bought for earlier meals this week)
 *   + gentle bonus in small appetite mode
 *   − penalty when the total time is unknown.
 * Ties break on recipe id, so the same input always gives the same week.
 */
import { DAY_INDICES, type DayIndex, type IsoDate } from './dates';
import type { FillAssignment } from './reducer';
import { cellKey, type CellKey, type MealSlot, type PlannedMeal, type WeekPlan } from './types';

/** Candidate recipe, shaped like the relevant `recipes` columns plus a recommender score. */
export interface FillCandidate {
  readonly id: string;
  /** Recommender score; higher is better. Any scale works, 0..1 is typical. */
  readonly score: number;
  readonly cuisine: string;
  readonly course: string;
  readonly total_minutes: number | null;
  readonly ingredientIds: readonly string[];
  readonly goal_tags: readonly string[];
  readonly gentle?: boolean | number | undefined;
}

/** Courses that may fill each slot. */
export const SLOT_COURSES: Readonly<Record<MealSlot, readonly string[]>> = {
  breakfast: ['breakfast'],
  lunch: ['main', 'soup', 'salad'],
  dinner: ['main', 'soup', 'salad'],
  snack: ['snack', 'side', 'salad'],
};

export interface FillWeights {
  readonly goalPerMatch: number;
  readonly goalCap: number;
  readonly pantry: number;
  readonly reuse: number;
  readonly gentle: number;
  readonly unknownTime: number;
}

export const DEFAULT_FILL_WEIGHTS: FillWeights = {
  goalPerMatch: 0.1,
  goalCap: 0.3,
  pantry: 0.2,
  reuse: 0.05,
  gentle: 0.1,
  unknownTime: 0.05,
};

export interface AutoFillInput {
  readonly weekStart: IsoDate;
  readonly candidates: readonly FillCandidate[];
  /** The week as currently planned; its cells are kept and count toward variety. */
  readonly plan?: WeekPlan | undefined;
  /** Slots to fill. Default breakfast, lunch, dinner (plus snack in small appetite mode). */
  readonly slots?: readonly MealSlot[] | undefined;
  /** Days to fill, e.g. only the remaining days of the current week. Default all seven. */
  readonly days?: readonly DayIndex[] | undefined;
  /**
   * Maximum total minutes for one meal: a single number for every day, or seven numbers starting
   * Monday. Omit for no limit.
   */
  readonly maxMinutesPerMeal?: number | readonly number[] | undefined;
  readonly goals?: readonly string[] | undefined;
  readonly pantryIds?: Iterable<string> | undefined;
  /** Ingredients that do not count toward pantry use (salt, oil …). */
  readonly stapleIds?: Iterable<string> | undefined;
  readonly servings: number;
  readonly smallAppetite?: boolean | undefined;
  readonly weights?: Partial<FillWeights> | undefined;
}

export type FillReason = 'goal' | 'pantry' | 'quick' | 'gentle';

export interface AutoFillAssignment extends FillAssignment {
  readonly score: number;
  readonly reasons: readonly FillReason[];
}

export interface AutoFillResult {
  readonly assignments: readonly AutoFillAssignment[];
  /** Cells that stayed empty because no candidate satisfied the hard rules. */
  readonly unfilled: readonly { day: DayIndex; slot: MealSlot }[];
  /** Cells where the cuisine-variety rule had to be relaxed. */
  readonly relaxed: readonly { day: DayIndex; slot: MealSlot }[];
}

/** Window size and cap for the cuisine-variety rule. */
export const VARIETY_WINDOW_DAYS = 3;
export const VARIETY_MAX_PER_WINDOW = 2;

function budgetFor(input: AutoFillInput, day: DayIndex): number {
  const b = input.maxMinutesPerMeal;
  if (b === undefined) return Number.POSITIVE_INFINITY;
  const value = typeof b === 'number' ? b : b[day];
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : Number.POSITIVE_INFINITY;
}

function cuisineFits(
  cuisineByDay: readonly Map<string, number>[],
  day: DayIndex,
  cuisine: string,
): boolean {
  // Every three-day window that contains `day` must stay at or under the cap after placing.
  for (let start = day - (VARIETY_WINDOW_DAYS - 1); start <= day; start += 1) {
    let count = 0;
    for (let d = start; d < start + VARIETY_WINDOW_DAYS; d += 1) {
      count += cuisineByDay[d]?.get(cuisine) ?? 0;
    }
    if (count + 1 > VARIETY_MAX_PER_WINDOW) return false;
  }
  return true;
}

export function autoFillWeek(input: AutoFillInput): AutoFillResult {
  const weights = { ...DEFAULT_FILL_WEIGHTS, ...input.weights };
  const small = input.smallAppetite === true;
  const slots =
    input.slots ??
    (small ? ['breakfast', 'lunch', 'dinner', 'snack'] : ['breakfast', 'lunch', 'dinner']);
  const days = [...(input.days ?? DAY_INDICES)].sort((a, b) => a - b);
  const goals = new Set(input.goals ?? []);
  const pantry = new Set(input.pantryIds ?? []);
  const staples = new Set(input.stapleIds ?? []);
  const portion = small ? 0.5 : 1;
  const servings = Number.isFinite(input.servings) && input.servings > 0 ? input.servings : 1;

  // Stable order: best score first, then id.
  const candidates = [...input.candidates]
    .filter((c) => c.id.length > 0 && Number.isFinite(c.score))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const used = new Set<string>();
  const cuisineByDay: Map<string, number>[] = DAY_INDICES.map(() => new Map());
  const bought = new Set<string>();
  const cells = input.plan?.weekStart === input.weekStart ? input.plan.cells : {};

  const remember = (day: DayIndex, c: FillCandidate | undefined, recipeId: string) => {
    used.add(recipeId);
    if (!c) return;
    const m = cuisineByDay[day];
    m?.set(c.cuisine, (m.get(c.cuisine) ?? 0) + 1);
    for (const id of c.ingredientIds) bought.add(id);
  };
  for (const key of Object.keys(cells) as CellKey[]) {
    const meal = cells[key];
    if (!meal) continue;
    const day = Number(key.split(':')[0]) as DayIndex;
    remember(day, byId.get(meal.recipeId), meal.recipeId);
  }

  const assignments: AutoFillAssignment[] = [];
  const unfilled: { day: DayIndex; slot: MealSlot }[] = [];
  const relaxed: { day: DayIndex; slot: MealSlot }[] = [];

  const evaluate = (c: FillCandidate) => {
    const reasons: FillReason[] = [];
    let score = c.score;
    const goalMatches = c.goal_tags.filter((t) => goals.has(t)).length;
    if (goalMatches > 0) {
      score += Math.min(weights.goalCap, goalMatches * weights.goalPerMatch);
      reasons.push('goal');
    }
    const own = [...new Set(c.ingredientIds)].filter((id) => !staples.has(id));
    if (own.length > 0) {
      const inPantry = own.filter((id) => pantry.has(id)).length / own.length;
      const reused = own.filter((id) => bought.has(id)).length / own.length;
      score += inPantry * weights.pantry + reused * weights.reuse;
      if (inPantry >= 0.5) reasons.push('pantry');
    }
    if (small && (c.gentle === true || c.gentle === 1)) {
      score += weights.gentle;
      reasons.push('gentle');
    }
    if (c.total_minutes === null) score -= weights.unknownTime;
    else if (c.total_minutes <= 30) reasons.push('quick');
    return { score, reasons };
  };

  for (const day of days) {
    const budget = budgetFor(input, day);
    for (const slot of slots) {
      if (cells[cellKey(day, slot)] !== undefined) continue;
      const courses = SLOT_COURSES[slot];
      const eligible = candidates.filter(
        (c) =>
          !used.has(c.id) &&
          courses.includes(c.course) &&
          (c.total_minutes === null || c.total_minutes <= budget),
      );
      const pick = (pool: readonly FillCandidate[]) => {
        let best: { c: FillCandidate; score: number; reasons: FillReason[] } | null = null;
        for (const c of pool) {
          const e = evaluate(c);
          // Candidates are pre-sorted by id within equal scores, so `>` keeps the first on ties.
          if (best === null || e.score > best.score + 1e-12) best = { c, ...e };
        }
        return best;
      };
      let chosen = pick(eligible.filter((c) => cuisineFits(cuisineByDay, day, c.cuisine)));
      if (chosen === null) {
        chosen = pick(eligible);
        if (chosen !== null) relaxed.push({ day, slot });
      }
      if (chosen === null) {
        unfilled.push({ day, slot });
        continue;
      }
      const meal: PlannedMeal = { recipeId: chosen.c.id, servings, portion };
      assignments.push({ day, slot, meal, score: chosen.score, reasons: chosen.reasons });
      remember(day, chosen.c, chosen.c.id);
    }
  }
  return { assignments, unfilled, relaxed };
}
