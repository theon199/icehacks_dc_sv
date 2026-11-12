/**
 * "Plan my week": fill empty planner cells from a ranked list of candidate recipes.
 *
 * The caller passes candidates already scored by the recommender and already filtered for the
 * person's allergens and diet (fail-closed: unknown allergen data must be excluded upstream). This
 * module never checks safety; it only arranges what it is given:
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
 * Ties on adjusted score break on the recommender score (higher first), then on recipe id, so the
 * same input always gives the same week.
 *
 * Cells already planned count toward the cuisine rule only when their cuisine is known: either the
 * recipe is among the candidates or its cuisine is given in `plannedCuisines`.
 */
import { DAY_INDICES, type DayIndex, type IsoDate } from './dates';
import type { FillAssignment } from './reducer';
import {
  cellKey,
  MEAL_SLOTS,
  type CellKey,
  type MealSlot,
  type PlannedMeal,
  type WeekPlan,
} from './types';

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
  /**
   * Slots to fill. Default breakfast, lunch, dinner (plus snack in small appetite mode). Filled in
   * `MEAL_SLOTS` order; duplicates and unknown slots are ignored.
   */
  readonly slots?: readonly MealSlot[] | undefined;
  /**
   * Days to fill, e.g. only the remaining days of the current week. Default all seven. Filled
   * Monday first; duplicates and values outside `DAY_INDICES` are ignored.
   */
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
  /**
   * Cuisine of recipes already in `plan` that are not among the candidates (for example ones the
   * person placed by hand), so they still count toward cuisine variety.
   */
  readonly plannedCuisines?: Readonly<Record<string, string>> | undefined;
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

interface Prepared {
  readonly c: FillCandidate;
  /** Recommender score plus the capped goal bonus. */
  readonly withGoal: number;
  /** Pantry share times its weight; fixed for the whole fill. */
  readonly pantryPart: number;
  /** Gentle bonus minus the unknown-time penalty, applied last. */
  readonly gentlePart: number;
  readonly unknownTime: boolean;
  /** Distinct non-staple ingredients. */
  readonly ownCount: number;
  readonly reasons: readonly FillReason[];
}

export function autoFillWeek(input: AutoFillInput): AutoFillResult {
  const weights = { ...DEFAULT_FILL_WEIGHTS, ...input.weights };
  const small = input.smallAppetite === true;
  // Duplicate or unknown days and slots would yield two assignments for one cell, so drop them.
  const requestedSlots: readonly MealSlot[] =
    input.slots ??
    (small ? ['breakfast', 'lunch', 'dinner', 'snack'] : ['breakfast', 'lunch', 'dinner']);
  const slots = MEAL_SLOTS.filter((slot) => requestedSlots.includes(slot));
  const requestedDays = input.days ?? DAY_INDICES;
  const days = DAY_INDICES.filter((day) => requestedDays.includes(day));
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

  // Everything about a candidate except ingredient reuse is fixed for the whole fill, so it is
  // worked out once here rather than for every cell. Reuse is tracked with running counts.
  const prepared: Prepared[] = [];
  const reuseCount: number[] = [];
  const holders = new Map<string, number[]>();
  for (const c of candidates) {
    const reasons: FillReason[] = [];
    let withGoal = c.score;
    const goalMatches = c.goal_tags.filter((t) => goals.has(t)).length;
    if (goalMatches > 0) {
      withGoal += Math.min(weights.goalCap, goalMatches * weights.goalPerMatch);
      reasons.push('goal');
    }
    const own = [...new Set(c.ingredientIds)].filter((id) => !staples.has(id));
    let pantryPart = 0;
    if (own.length > 0) {
      const inPantry = own.filter((id) => pantry.has(id)).length / own.length;
      pantryPart = inPantry * weights.pantry;
      if (inPantry >= 0.5) reasons.push('pantry');
    }
    let gentlePart = 0;
    if (small && (c.gentle === true || c.gentle === 1)) {
      gentlePart = weights.gentle;
      reasons.push('gentle');
    }
    if (c.total_minutes !== null && c.total_minutes <= 30) reasons.push('quick');
    const index = prepared.length;
    for (const id of own) {
      const list = holders.get(id);
      if (list) list.push(index);
      else holders.set(id, [index]);
    }
    prepared.push({
      c,
      withGoal,
      pantryPart,
      gentlePart,
      unknownTime: c.total_minutes === null,
      ownCount: own.length,
      reasons,
    });
    reuseCount.push(0);
  }

  const used = new Set<string>();
  const cuisineByDay: Map<string, number>[] = DAY_INDICES.map(() => new Map());
  const bought = new Set<string>();
  const cells = input.plan?.weekStart === input.weekStart ? input.plan.cells : {};

  const remember = (day: DayIndex, c: FillCandidate | undefined, recipeId: string) => {
    used.add(recipeId);
    const cuisine = c?.cuisine ?? input.plannedCuisines?.[recipeId];
    if (cuisine !== undefined) {
      const m = cuisineByDay[day];
      m?.set(cuisine, (m.get(cuisine) ?? 0) + 1);
    }
    for (const id of c?.ingredientIds ?? []) {
      if (bought.has(id)) continue;
      bought.add(id);
      for (const index of holders.get(id) ?? []) reuseCount[index] = (reuseCount[index] ?? 0) + 1;
    }
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

  const scoreOf = (index: number): number => {
    const p = prepared[index] as Prepared;
    let score = p.withGoal;
    if (p.ownCount > 0) {
      score += p.pantryPart + ((reuseCount[index] ?? 0) / p.ownCount) * weights.reuse;
    }
    score += p.gentlePart;
    if (p.unknownTime) score -= weights.unknownTime;
    return score;
  };

  for (const day of days) {
    const budget = budgetFor(input, day);
    for (const slot of slots) {
      if (cells[cellKey(day, slot)] !== undefined) continue;
      const courses = SLOT_COURSES[slot];
      const eligible: number[] = [];
      prepared.forEach(({ c }, index) => {
        if (
          !used.has(c.id) &&
          courses.includes(c.course) &&
          (c.total_minutes === null || c.total_minutes <= budget)
        ) {
          eligible.push(index);
        }
      });
      const pick = (pool: readonly number[]) => {
        let best: { index: number; score: number } | null = null;
        for (const index of pool) {
          const score = scoreOf(index);
          // The pool is pre-sorted by recommender score, then id, so `>` keeps the earlier one
          // when adjusted scores tie: higher raw score first, then the smaller id.
          if (best === null || score > best.score + 1e-12) best = { index, score };
        }
        return best;
      };
      let chosen = pick(
        eligible.filter((i) => cuisineFits(cuisineByDay, day, (prepared[i] as Prepared).c.cuisine)),
      );
      if (chosen === null) {
        chosen = pick(eligible);
        if (chosen !== null) relaxed.push({ day, slot });
      }
      if (chosen === null) {
        unfilled.push({ day, slot });
        continue;
      }
      const { c, reasons } = prepared[chosen.index] as Prepared;
      const meal: PlannedMeal = { recipeId: c.id, servings, portion };
      assignments.push({ day, slot, meal, score: chosen.score, reasons: [...reasons] });
      remember(day, c, c.id);
    }
  }
  return { assignments, unfilled, relaxed };
}
