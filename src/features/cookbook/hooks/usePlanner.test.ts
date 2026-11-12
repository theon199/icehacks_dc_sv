import { useMealPlanStore, usePreferencesStore } from '@/stores';

import { hasPastActiveWeeks, plannerActions, type SlotRef } from './usePlanner';

const WEEK = '2026-11-09';
const NEXT = '2026-11-16';
const cell = (day: SlotRef['day'], slot: SlotRef['slot'], week = WEEK): SlotRef => ({
  week,
  day,
  slot,
});
const slots = (week = WEEK) => useMealPlanStore.getState().weeks[week]?.slots ?? {};

beforeEach(() => {
  useMealPlanStore.getState().reset();
  usePreferencesStore.getState().reset();
  usePreferencesStore.getState().update({ householdSize: 3 });
});

describe('planner actions', () => {
  it('adds a meal with the household size as servings', () => {
    plannerActions.place(cell(1, 'dinner'), 'r1');
    expect(slots()['1-dinner']).toMatchObject({ recipeId: 'r1', servings: 3 });
  });

  it('moves a meal to an empty slot, including into the next week', () => {
    plannerActions.place(cell(1, 'dinner'), 'r1');
    plannerActions.move(cell(1, 'dinner'), cell(4, 'lunch'));
    expect(slots()['1-dinner']).toBeUndefined();
    expect(slots()['4-lunch']?.recipeId).toBe('r1');

    plannerActions.move(cell(4, 'lunch'), cell(0, 'lunch', NEXT));
    expect(slots()['4-lunch']).toBeUndefined();
    expect(slots(NEXT)['0-lunch']?.recipeId).toBe('r1');
  });

  it('swaps two meals when moving onto an occupied slot', () => {
    plannerActions.place(cell(0, 'dinner'), 'a');
    plannerActions.place(cell(2, 'dinner'), 'b');
    plannerActions.move(cell(0, 'dinner'), cell(2, 'dinner'));
    expect(slots()['0-dinner']?.recipeId).toBe('b');
    expect(slots()['2-dinner']?.recipeId).toBe('a');
  });

  it('clears a slot, a day and a week', () => {
    plannerActions.place(cell(0, 'breakfast'), 'a');
    plannerActions.place(cell(0, 'dinner'), 'b');
    plannerActions.place(cell(3, 'lunch'), 'c');

    plannerActions.clear(cell(0, 'breakfast'));
    expect(Object.keys(slots()).sort()).toEqual(['0-dinner', '3-lunch']);

    plannerActions.clearDay(WEEK, 0);
    expect(Object.keys(slots())).toEqual(['3-lunch']);

    plannerActions.clearWeek(WEEK);
    expect(useMealPlanStore.getState().weeks[WEEK]).toBeUndefined();
  });

  it('applies planner output only to empty slots and counts what landed', () => {
    plannerActions.place(cell(2, 'dinner'), 'mine');
    const placed = plannerActions.applyWrites(WEEK, [
      { slot: '2-dinner', recipeId: 'auto1', servings: 2 },
      { slot: '2-lunch', recipeId: 'auto2', servings: 2 },
      { slot: '3-lunch', recipeId: 'auto3', servings: 2 },
    ]);
    expect(placed).toBe(2);
    expect(slots()['2-dinner']?.recipeId).toBe('mine');
    expect(slots()['2-lunch']?.recipeId).toBe('auto2');
  });

  it('archives past weeks, restores and deletes them', () => {
    plannerActions.place(cell(0, 'dinner', '2026-11-02'), 'old');
    plannerActions.place(cell(0, 'dinner'), 'current');
    expect(hasPastActiveWeeks(useMealPlanStore.getState(), '2026-11-11')).toBe(true);

    plannerActions.archivePast(new Date(2026, 10, 11, 9));
    const weeks = useMealPlanStore.getState().weeks;
    expect(weeks['2026-11-02']?.archivedAt).not.toBeNull();
    expect(weeks[WEEK]?.archivedAt).toBeNull();
    expect(hasPastActiveWeeks(useMealPlanStore.getState(), '2026-11-11')).toBe(false);

    plannerActions.restore('2026-11-02');
    expect(useMealPlanStore.getState().weeks['2026-11-02']?.archivedAt).toBeNull();

    plannerActions.archive(WEEK);
    expect(useMealPlanStore.getState().weeks[WEEK]?.archivedAt).not.toBeNull();
    plannerActions.deleteWeek(WEEK);
    expect(useMealPlanStore.getState().weeks[WEEK]).toBeUndefined();
  });
});
