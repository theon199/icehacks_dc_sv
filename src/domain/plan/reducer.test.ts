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
  describe('rejects invalid cell references and dates', () => {
    const base = run({ type: 'place', at: AT, cell: cell(0, 'dinner'), meal: meal('a') });
    const badDay = 9 as unknown as CellRef['day'];
    const badSlot = 'brunch' as unknown as CellRef['slot'];
    const badRefs: readonly CellRef[] = [
      cell(0, 'dinner', '2026-11-10'), // a Tuesday
      cell(0, 'dinner', '2026-02-30'), // not a real date
      cell(0, 'dinner', 'next week'),
      cell(badDay, 'dinner'),
      cell(-1 as unknown as CellRef['day'], 'dinner'),
      cell(0, badSlot),
    ];

    it.each(badRefs)('ignores place/clear/setServings/move/swap for %o', (ref) => {
      const actions: PlanAction[] = [
        { type: 'place', at: AT, cell: ref, meal: meal('b') },
        { type: 'clear', at: AT, cell: ref },
        { type: 'setServings', at: AT, cell: ref, servings: 3 },
        { type: 'move', at: AT, from: cell(0, 'dinner'), to: ref },
        { type: 'move', at: AT, from: ref, to: cell(0, 'dinner') },
        { type: 'swap', at: AT, a: cell(0, 'dinner'), b: ref },
      ];
      for (const action of actions) {
        expect(() => planReducer(base, action)).not.toThrow();
        expect(planReducer(base, action)).toBe(base);
      }
    });

    it('never creates a duplicate week key for a non-Monday week', () => {
      const s = planReducer(base, {
        type: 'place',
        at: AT,
        cell: cell(2, 'lunch', '2026-11-11'),
        meal: meal('b'),
      });
      expect(Object.keys(s.weeks)).toEqual([WEEK]);
    });

    it('applyFill ignores a bad week and drops assignments with a bad day or slot', () => {
      const assignments = [
        { day: badDay, slot: 'dinner' as const, meal: meal('x') },
        { day: 1 as const, slot: badSlot, meal: meal('y') },
        { day: 2 as const, slot: 'lunch' as const, meal: meal('z') },
      ];
      expect(
        planReducer(base, { type: 'applyFill', at: AT, week: '2026-11-12', assignments }),
      ).toBe(base);
      const s = planReducer(base, { type: 'applyFill', at: AT, week: WEEK, assignments });
      expect(Object.keys(s.weeks[WEEK]?.cells ?? {}).sort()).toEqual(['0:dinner', '2:lunch']);
    });

    it('ignores malformed meals and missing cell references without throwing', () => {
      const badMeals = [
        {},
        null,
        { servings: 2, portion: 1 },
        { recipeId: 42, servings: 2, portion: 1 },
        { recipeId: 'b', servings: '2', portion: 1 },
        { recipeId: 'b', servings: 2 },
      ] as unknown as PlannedMeal[];
      for (const bad of badMeals) {
        const action: PlanAction = { type: 'place', at: AT, cell: cell(1, 'lunch'), meal: bad };
        expect(() => planReducer(base, action)).not.toThrow();
        expect(planReducer(base, action)).toBe(base);
      }
      const missing = [null, undefined, 'monday'] as unknown as CellRef[];
      for (const ref of missing) {
        const actions: PlanAction[] = [
          { type: 'place', at: AT, cell: ref, meal: meal('b') },
          { type: 'clear', at: AT, cell: ref },
          { type: 'setServings', at: AT, cell: ref, servings: 3 },
          { type: 'move', at: AT, from: ref, to: cell(0, 'dinner') },
          { type: 'swap', at: AT, a: cell(0, 'dinner'), b: ref },
        ];
        for (const action of actions) {
          expect(() => planReducer(base, action)).not.toThrow();
          expect(planReducer(base, action)).toBe(base);
        }
      }
      const fill = {
        type: 'applyFill',
        at: AT,
        week: WEEK,
        assignments: [null, { day: 1, slot: 'lunch', meal: {} }],
      } as unknown as PlanAction;
      expect(() => planReducer(base, fill)).not.toThrow();
      expect(planReducer(base, fill)).toBe(base);
      const notArray = { ...fill, assignments: 'all' } as unknown as PlanAction;
      expect(planReducer(base, notArray)).toBe(base);
    });

    it('clearDay ignores an out-of-range day', () => {
      expect(planReducer(base, { type: 'clearDay', at: AT, week: WEEK, day: badDay })).toBe(base);
    });

    it('archivePast with an invalid today is a no-op instead of throwing', () => {
      for (const today of ['', 'yesterday', '2026-13-01', '2026-02-29']) {
        expect(() => planReducer(base, { type: 'archivePast', at: AT, today })).not.toThrow();
        expect(planReducer(base, { type: 'archivePast', at: AT, today })).toBe(base);
      }
    });
  });
});
