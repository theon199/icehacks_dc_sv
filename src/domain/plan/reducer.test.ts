import {
  ARCHIVE_LIMIT,
  addDays,
  getMeal,
  initialPlannerState,
  planReducer,
  plannedRecipeIds,
  type CellRef,
  type PlanAction,
  type PlannedMeal,
  type PlannerState,
} from './index';

const WEEK = '2026-11-09';
const NEXT = '2026-11-16';
const AT = '2026-11-11T10:00:00.000Z';

function meal(recipeId: string, servings = 2): PlannedMeal {
  return { recipeId, servings, portion: 1 };
}

function cell(day: CellRef['day'], slot: CellRef['slot'], week = WEEK): CellRef {
  return { week, day, slot };
}

function run(...actions: PlanAction[]): PlannerState {
  return actions.reduce(planReducer, initialPlannerState);
}

describe('planReducer', () => {
  it('places meals and stamps the week', () => {
    const s = run({ type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('a') });
    expect(getMeal(s, cell(0, 'dinner'))).toEqual(meal('a'));
    expect(s.weeks[WEEK]?.updatedAt).toBe(AT);
  });

  it('ignores invalid meals', () => {
    const s = run({ type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('a', 0) });
    expect(s).toBe(initialPlannerState);
  });

  it('moves into an empty cell, including across weeks', () => {
    const s = run(
      { type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('a') },
      { type: 'move', at: AT, from: cell(0, 'dinner'), to: cell(2, 'lunch', NEXT) },
    );
    expect(getMeal(s, cell(0, 'dinner'))).toBeUndefined();
    expect(getMeal(s, cell(2, 'lunch', NEXT))).toEqual(meal('a'));
    expect(s.weeks[WEEK]).toBeUndefined(); // an emptied week is dropped
  });

  it('moving onto an occupied cell swaps the two meals', () => {
    const s = run(
      { type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('a') },
      { type: 'place', at: AT, cell: cell(1, 'dinner'), meal: meal('b') },
      { type: 'move', at: AT, from: cell(0, 'dinner'), to: cell(1, 'dinner') },
    );
    expect(getMeal(s, cell(0, 'dinner'))?.recipeId).toBe('b');
    expect(getMeal(s, cell(1, 'dinner'))?.recipeId).toBe('a');
  });

  it('swap with one empty side acts as a move; moving from an empty cell is a no-op', () => {
    const placed = run({ type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('a') });
    const swapped = planReducer(placed, {
      type: 'swap',
      at: AT,
      a: cell(3, 'lunch'),
      b: cell(0, 'dinner'),
    });
    expect(getMeal(swapped, cell(3, 'lunch'))?.recipeId).toBe('a');
    const same = planReducer(placed, {
      type: 'move',
      at: AT,
      from: cell(4, 'lunch'),
      to: cell(0, 'dinner'),
    });
    expect(same).toBe(placed);
  });

  it('clears a cell, a day and a week', () => {
    const s = run(
      { type: 'place', at: AT, cell: cell(0, 'breakfast'), meal: meal('a') },
      { type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('b') },
      { type: 'place', at: AT, cell: cell(1, 'dinner'), meal: meal('c') },
    );
    const oneCleared = planReducer(s, { type: 'clear', at: AT, cell: cell(0, 'breakfast') });
    expect(plannedRecipeIds(oneCleared.weeks[WEEK])).toEqual(['b', 'c']);
    const dayCleared = planReducer(s, { type: 'clearDay', at: AT, week: WEEK, day: 0 });
    expect(plannedRecipeIds(dayCleared.weeks[WEEK])).toEqual(['c']);
    const weekCleared = planReducer(s, { type: 'clearWeek', at: AT, week: WEEK });
    expect(weekCleared.weeks).toEqual({});
    expect(planReducer(weekCleared, { type: 'clearWeek', at: AT, week: WEEK })).toBe(weekCleared);
  });

  it('changes servings only for valid values', () => {
    const s = run({ type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('a') });
    const four = planReducer(s, {
      type: 'setServings',
      at: AT,
      cell: cell(0, 'dinner'),
      servings: 4,
    });
    expect(getMeal(four, cell(0, 'dinner'))?.servings).toBe(4);
    expect(
      planReducer(s, { type: 'setServings', at: AT, cell: cell(0, 'dinner'), servings: -1 }),
    ).toBe(s);
    expect(
      planReducer(s, { type: 'setServings', at: AT, cell: cell(5, 'dinner'), servings: 3 }),
    ).toBe(s);
  });

  it('applies auto-fill without overwriting unless asked', () => {
    const s = run({ type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('mine') });
    const assignments = [
      { day: 0 as const, slot: 'dinner' as const, meal: meal('auto1') },
      { day: 1 as const, slot: 'dinner' as const, meal: meal('auto2') },
    ];
    const kept = planReducer(s, { type: 'applyFill', at: AT, week: WEEK, assignments });
    expect(plannedRecipeIds(kept.weeks[WEEK])).toEqual(['mine', 'auto2']);
    const replaced = planReducer(s, {
      type: 'applyFill',
      at: AT,
      week: WEEK,
      assignments,
      overwrite: true,
    });
    expect(plannedRecipeIds(replaced.weeks[WEEK])).toEqual(['auto1', 'auto2']);
  });

  it('lists planned recipes in day and meal order', () => {
    const s = run(
      { type: 'place', at: AT, cell: cell(1, 'breakfast'), meal: meal('d') },
      { type: 'place', at: AT, cell: cell(0, 'snack'), meal: meal('c') },
      { type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('b') },
      { type: 'place', at: AT, cell: cell(0, 'breakfast'), meal: meal('a') },
    );
    expect(plannedRecipeIds(s.weeks[WEEK])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('archives, restores and deletes weeks', () => {
    const s = run(
      { type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('a') },
      { type: 'archiveWeek', at: 'T1', week: WEEK },
    );
    expect(s.weeks[WEEK]).toBeUndefined();
    expect(s.archive).toHaveLength(1);
    expect(s.archive[0]?.archivedAt).toBe('T1');

    const restored = planReducer(s, {
      type: 'restoreWeek',
      at: 'T2',
      weekStart: WEEK,
      archivedAt: 'T1',
    });
    expect(plannedRecipeIds(restored.weeks[WEEK])).toEqual(['a']);
    expect(restored.archive).toEqual([]);

    const deleted = planReducer(s, { type: 'deleteArchived', weekStart: WEEK, archivedAt: 'T1' });
    expect(deleted.archive).toEqual([]);
    expect(
      planReducer(deleted, { type: 'deleteArchived', weekStart: WEEK, archivedAt: 'T1' }),
    ).toBe(deleted);
  });

  it('does not restore over a week that already has meals', () => {
    const s = run(
      { type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('a') },
      { type: 'archiveWeek', at: 'T1', week: WEEK },
      { type: 'place', at: AT, cell: cell(2, 'dinner'), meal: meal('b') },
    );
    expect(
      planReducer(s, { type: 'restoreWeek', at: 'T2', weekStart: WEEK, archivedAt: 'T1' }),
    ).toBe(s);
  });

  it('archives every past week, newest first, and caps the archive', () => {
    let s = initialPlannerState;
    for (let i = 0; i < ARCHIVE_LIMIT + 5; i += 1) {
      s = planReducer(s, {
        type: 'place',
        at: AT,
        cell: cell(0, 'dinner', addDays('2025-01-06', i * 7)),
        meal: meal(`r${i}`),
      });
    }
    s = planReducer(s, { type: 'place', at: AT, cell: cell(0, 'dinner', NEXT), meal: meal('x') });
    const archived = planReducer(s, { type: 'archivePast', at: 'T', today: '2026-11-18' });
    expect(Object.keys(archived.weeks)).toEqual([NEXT]);
    expect(archived.archive).toHaveLength(ARCHIVE_LIMIT);
    const starts = archived.archive.map((a) => a.week.weekStart);
    expect([...starts].sort().reverse()).toEqual(starts);
    expect(planReducer(archived, { type: 'archivePast', at: 'T', today: '2026-11-18' })).toBe(
      archived,
    );
  });

  it('never mutates the previous state', () => {
    const s = run({ type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('a') });
    const frozen = JSON.stringify(s);
    planReducer(s, { type: 'move', at: AT, from: cell(0, 'dinner'), to: cell(1, 'dinner') });
    planReducer(s, { type: 'archiveWeek', at: AT, week: WEEK });
    expect(JSON.stringify(s)).toBe(frozen);
  });
});
