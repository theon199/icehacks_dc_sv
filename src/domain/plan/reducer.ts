/**
 * Pure reducer for the weekly planner. Every action carries the timestamp it happened at so the
 * reducer never reads the clock. Actions that change nothing return the same state object, which
 * lets stores skip re-renders and sync writes.
 */
import { weekStartOf, type DayIndex, type IsoDate } from './dates';
import {
  cellKey,
  MEAL_SLOTS,
  parseCellKey,
  type ArchivedWeek,
  type CellKey,
  type CellRef,
  type MealSlot,
  type PlannedMeal,
  type PlannerState,
  type WeekPlan,
} from './types';

/** How many archived weeks are kept; older ones are dropped first. */
export const ARCHIVE_LIMIT = 52;

export interface FillAssignment {
  readonly day: DayIndex;
  readonly slot: MealSlot;
  readonly meal: PlannedMeal;
}

export type PlanAction =
  | { type: 'place'; at: string; cell: CellRef; meal: PlannedMeal }
  /** Move a meal; when the destination is occupied the two meals trade places. */
  | { type: 'move'; at: string; from: CellRef; to: CellRef }
  | { type: 'swap'; at: string; a: CellRef; b: CellRef }
  | { type: 'clear'; at: string; cell: CellRef }
  | { type: 'clearDay'; at: string; week: IsoDate; day: DayIndex }
  | { type: 'clearWeek'; at: string; week: IsoDate }
  | { type: 'setServings'; at: string; cell: CellRef; servings: number }
  /** Apply auto-fill results. Occupied cells are kept unless `overwrite` is set. */
  | {
      type: 'applyFill';
      at: string;
      week: IsoDate;
      assignments: readonly FillAssignment[];
      overwrite?: boolean;
    }
  | { type: 'archiveWeek'; at: string; week: IsoDate }
  /** Archive every week that ends before the week containing `today`. */
  | { type: 'archivePast'; at: string; today: IsoDate }
  /** Bring an archived week back; refused if that week already has a plan with meals. */
  | { type: 'restoreWeek'; at: string; weekStart: IsoDate; archivedAt: string }
  | { type: 'deleteArchived'; weekStart: IsoDate; archivedAt: string };

export const initialPlannerState: PlannerState = { weeks: {}, archive: [] };

export function emptyWeek(weekStart: IsoDate): WeekPlan {
  return { weekStart, cells: {}, updatedAt: null };
}

export function getMeal(state: PlannerState, cell: CellRef): PlannedMeal | undefined {
  return state.weeks[cell.week]?.cells[cellKey(cell.day, cell.slot)];
}

function isValidMeal(meal: PlannedMeal): boolean {
  return (
    meal.recipeId.length > 0 &&
    Number.isFinite(meal.servings) &&
    meal.servings > 0 &&
    Number.isFinite(meal.portion) &&
    meal.portion > 0
  );
}

function hasMeals(week: WeekPlan | undefined): boolean {
  return week !== undefined && Object.keys(week.cells).length > 0;
}

/** Apply cell edits to a set of weeks, dropping weeks that end up empty. */
function editCells(
  state: PlannerState,
  at: string,
  edits: readonly { week: IsoDate; key: CellKey; meal: PlannedMeal | undefined }[],
): PlannerState {
  const weeks: Record<IsoDate, WeekPlan> = { ...state.weeks };
  let changed = false;
  for (const { week, key, meal } of edits) {
    const current = weeks[week] ?? emptyWeek(week);
    if (current.cells[key] === meal) continue;
    const cells: Partial<Record<CellKey, PlannedMeal>> = { ...current.cells };
    if (meal === undefined) delete cells[key];
    else cells[key] = meal;
    changed = true;
    if (Object.keys(cells).length === 0) delete weeks[week];
    else weeks[week] = { weekStart: week, cells, updatedAt: at };
  }
  return changed ? { ...state, weeks } : state;
}

function archiveWeeks(state: PlannerState, at: string, starts: readonly IsoDate[]): PlannerState {
  const toArchive = [...starts].sort().filter((s) => hasMeals(state.weeks[s]));
  if (toArchive.length === 0) return state;
  const weeks: Record<IsoDate, WeekPlan> = { ...state.weeks };
  const added: ArchivedWeek[] = [];
  // Newest week first so the archive reads most-recent-first.
  for (const s of [...toArchive].reverse()) {
    const week = weeks[s];
    if (week) added.push({ week, archivedAt: at });
    delete weeks[s];
  }
  return { weeks, archive: [...added, ...state.archive].slice(0, ARCHIVE_LIMIT) };
}

export function planReducer(state: PlannerState, action: PlanAction): PlannerState {
  switch (action.type) {
    case 'place': {
      if (!isValidMeal(action.meal)) return state;
      const { week, day, slot } = action.cell;
      return editCells(state, action.at, [{ week, key: cellKey(day, slot), meal: action.meal }]);
    }
    case 'move':
    case 'swap': {
      const a = action.type === 'move' ? action.from : action.a;
      const b = action.type === 'move' ? action.to : action.b;
      const mealA = getMeal(state, a);
      const mealB = getMeal(state, b);
      if (mealA === undefined && (action.type === 'move' || mealB === undefined)) return state;
      return editCells(state, action.at, [
        { week: a.week, key: cellKey(a.day, a.slot), meal: mealB },
        { week: b.week, key: cellKey(b.day, b.slot), meal: mealA },
      ]);
    }
    case 'clear': {
      const { week, day, slot } = action.cell;
      return editCells(state, action.at, [{ week, key: cellKey(day, slot), meal: undefined }]);
    }
    case 'clearDay': {
      const week = state.weeks[action.week];
      if (!week) return state;
      const prefix = `${action.day}:`;
      const keys = (Object.keys(week.cells) as CellKey[]).filter((k) => k.startsWith(prefix));
      return editCells(
        state,
        action.at,
        keys.map((key) => ({ week: action.week, key, meal: undefined })),
      );
    }
    case 'clearWeek': {
      if (!state.weeks[action.week]) return state;
      const weeks: Record<IsoDate, WeekPlan> = { ...state.weeks };
      delete weeks[action.week];
      return { ...state, weeks };
    }
    case 'setServings': {
      const meal = getMeal(state, action.cell);
      if (!meal || !Number.isFinite(action.servings) || action.servings <= 0) return state;
      if (meal.servings === action.servings) return state;
      const { week, day, slot } = action.cell;
      return editCells(state, action.at, [
        { week, key: cellKey(day, slot), meal: { ...meal, servings: action.servings } },
      ]);
    }
    case 'applyFill': {
      const existing = state.weeks[action.week]?.cells ?? {};
      const edits = action.assignments
        .filter((a) => isValidMeal(a.meal))
        .filter((a) => action.overwrite === true || existing[cellKey(a.day, a.slot)] === undefined)
        .map((a) => ({ week: action.week, key: cellKey(a.day, a.slot), meal: a.meal }));
      return editCells(state, action.at, edits);
    }
    case 'archiveWeek':
      return archiveWeeks(state, action.at, [action.week]);
    case 'archivePast': {
      const current = weekStartOf(action.today);
      return archiveWeeks(
        state,
        action.at,
        Object.keys(state.weeks).filter((s) => s < current),
      );
    }
    case 'restoreWeek': {
      const index = state.archive.findIndex(
        (a) => a.week.weekStart === action.weekStart && a.archivedAt === action.archivedAt,
      );
      const entry = state.archive[index];
      if (!entry || hasMeals(state.weeks[action.weekStart])) return state;
      return {
        weeks: { ...state.weeks, [action.weekStart]: { ...entry.week, updatedAt: action.at } },
        archive: state.archive.filter((_, i) => i !== index),
      };
    }
    case 'deleteArchived': {
      const archive = state.archive.filter(
        (a) => !(a.week.weekStart === action.weekStart && a.archivedAt === action.archivedAt),
      );
      return archive.length === state.archive.length ? state : { ...state, archive };
    }
  }
}

/** Recipe ids planned in a week, in day then slot order (duplicates kept). */
export function plannedRecipeIds(week: WeekPlan | undefined): string[] {
  if (!week) return [];
  const order = (k: CellKey) => {
    const { day, slot } = parseCellKey(k);
    return day * MEAL_SLOTS.length + MEAL_SLOTS.indexOf(slot);
  };
  return (Object.keys(week.cells) as CellKey[])
    .sort((a, b) => order(a) - order(b))
    .map((k) => week.cells[k]?.recipeId)
    .filter((id): id is string => id !== undefined);
}
