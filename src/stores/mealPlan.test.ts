import {
  clearSlot,
  MAX_ARCHIVED_WEEKS,
  mealPlanSync,
  moveSlot,
  plannedRecipeIds,
  rolloverWeeks,
  selectActiveWeeks,
  selectArchivedWeeks,
  selectWeekSlots,
  setSlot,
  setWeekArchived,
  shiftWeek,
  trimArchive,
  useMealPlanStore,
  weekStartOf,
  type PlanWeek,
} from './mealPlan';

const at = '2026-11-11T10:00:00.000Z';
const W = '2026-11-09';

beforeEach(() => useMealPlanStore.getState().reset());

describe('week helpers', () => {
  it('finds the local Monday of a week', () => {
    expect(weekStartOf(new Date(2026, 10, 11))).toBe('2026-11-09');
    expect(weekStartOf(new Date(2026, 10, 15, 23, 59))).toBe('2026-11-09');
    expect(weekStartOf(new Date(2026, 10, 9, 0, 1))).toBe('2026-11-09');
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04');
    expect(shiftWeek(W, -1)).toBe('2026-11-02');
  });
});

describe('slot transitions', () => {
  it('sets, replaces and clears slots', () => {
    let weeks = setSlot({}, W, '0-dinner', { recipeId: 'r1', servings: 2 }, at);
    expect(weeks[W]?.slots['0-dinner']).toMatchObject({ recipeId: 'r1', servings: 2 });
    expect(setSlot(weeks, W, '0-dinner', { recipeId: 'r1', servings: 2 }, at)).toBe(weeks);
    expect(setSlot(weeks, W, '9-dinner' as never, { recipeId: 'r1', servings: 2 }, at)).toBe(weeks);
    expect(setSlot(weeks, W, '1-lunch', { recipeId: 'r2', servings: 0 }, at)).toBe(weeks);
    weeks = clearSlot(weeks, W, '0-dinner');
    expect(weeks[W]?.slots).toEqual({});
  });

  it('moves entries across slots and weeks, swapping with an occupied target', () => {
    let weeks = setSlot({}, W, '0-dinner', { recipeId: 'a', servings: 2 }, at);
    weeks = setSlot(weeks, W, '1-dinner', { recipeId: 'b', servings: 2 }, at);
    weeks = moveSlot(weeks, { weekStart: W, slot: '0-dinner' }, { weekStart: W, slot: '1-dinner' });
    expect(weeks[W]?.slots['0-dinner']?.recipeId).toBe('b');
    expect(weeks[W]?.slots['1-dinner']?.recipeId).toBe('a');

    const next = shiftWeek(W, 1);
    weeks = moveSlot(
      weeks,
      { weekStart: W, slot: '0-dinner' },
      { weekStart: next, slot: '3-lunch' },
    );
    expect(weeks[W]?.slots['0-dinner']).toBeUndefined();
    expect(weeks[next]?.slots['3-lunch']?.recipeId).toBe('b');
    expect(plannedRecipeIds(weeks[W])).toEqual(['a']);
  });
});

describe('archive', () => {
  it('archives past weeks with meals and drops empty ones', () => {
    let weeks = setSlot({}, shiftWeek(W, -1), '2-lunch', { recipeId: 'r', servings: 1 }, at);
    weeks = {
      ...weeks,
      [shiftWeek(W, -2)]: { weekStart: shiftWeek(W, -2), slots: {}, archivedAt: null },
    };
    weeks = setSlot(weeks, W, '0-breakfast', { recipeId: 'r', servings: 1 }, at);
    const rolled = rolloverWeeks(weeks, W, at);
    expect(rolled[shiftWeek(W, -1)]?.archivedAt).toBe(at);
    expect(rolled[shiftWeek(W, -2)]).toBeUndefined();
    expect(rolled[W]?.archivedAt).toBeNull();
    expect(rolloverWeeks(rolled, W, at)).toBe(rolled);
  });

  it('keeps at most a year of archived weeks', () => {
    const weeks: Record<string, PlanWeek> = {};
    for (let i = 1; i <= MAX_ARCHIVED_WEEKS + 3; i += 1) {
      const start = shiftWeek(W, -i);
      weeks[start] = { weekStart: start, slots: {}, archivedAt: at };
    }
    const trimmed = trimArchive(weeks);
    expect(Object.keys(trimmed)).toHaveLength(MAX_ARCHIVED_WEEKS);
    expect(trimmed[shiftWeek(W, -1)]).toBeDefined();
    expect(trimmed[shiftWeek(W, -(MAX_ARCHIVED_WEEKS + 3))]).toBeUndefined();
  });

  it('archives and restores a week through the store', () => {
    const store = useMealPlanStore.getState();
    store.setSlot(W, '4-dinner', { recipeId: 'r', servings: 2 });
    store.archiveWeek(W, at);
    expect(selectArchivedWeeks(useMealPlanStore.getState()).map((w) => w.weekStart)).toEqual([W]);
    expect(setWeekArchived(useMealPlanStore.getState().weeks, W, at)).toBe(
      useMealPlanStore.getState().weeks,
    );
    store.unarchiveWeek(W);
    expect(selectActiveWeeks(useMealPlanStore.getState())).toHaveLength(1);
    expect(selectWeekSlots(W)(useMealPlanStore.getState())['4-dinner']?.recipeId).toBe('r');
    expect(selectWeekSlots('2030-01-07')(useMealPlanStore.getState())).toBe(
      selectWeekSlots('2031-01-06')(useMealPlanStore.getState()),
    );
  });
});

describe('mealPlanSync', () => {
  it('syncs one document per week and rejects malformed weeks', () => {
    useMealPlanStore.getState().setSlot(W, '0-lunch', { recipeId: 'r', servings: 1 });
    expect([...mealPlanSync.getDocs().keys()]).toEqual([W]);
    const result = mealPlanSync.applyRemote({
      upserts: [
        {
          docId: '2026-11-16',
          data: { weekStart: '2026-11-16', slots: { '7-lunch': {} }, archivedAt: null },
        },
      ],
      deletes: [W],
    });
    expect(result.rejected).toEqual(['2026-11-16']);
    expect(useMealPlanStore.getState().weeks).toEqual({});
  });
});
