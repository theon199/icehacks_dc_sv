import {
  autoFillWeek,
  cellKey,
  VARIETY_MAX_PER_WINDOW,
  type AutoFillResult,
  type DayIndex,
  type FillCandidate,
  type WeekPlan,
} from './index';

const WEEK = '2026-11-09';
const CUISINES = ['italian', 'indian', 'mexican', 'japanese', 'greek', 'thai'];
const BREAKFAST_CUISINES = ['american', 'french', 'korean', 'turkish'];

function candidate(id: string, overrides: Partial<FillCandidate> = {}): FillCandidate {
  return {
    id,
    score: 0.5,
    cuisine: 'italian',
    course: 'main',
    total_minutes: 30,
    ingredientIds: [],
    goal_tags: [],
    ...overrides,
  };
}

/** A varied pool: 14 breakfasts, 40 mains, 10 snacks. */
function pool(): FillCandidate[] {
  const out: FillCandidate[] = [];
  for (let i = 0; i < 14; i += 1) {
    out.push(
      candidate(`b${i}`, {
        course: 'breakfast',
        cuisine: BREAKFAST_CUISINES[i % BREAKFAST_CUISINES.length] as string,
        score: 0.9 - i * 0.01,
        total_minutes: 10 + i,
      }),
    );
  }
  for (let i = 0; i < 40; i += 1) {
    out.push(
      candidate(`m${String(i).padStart(2, '0')}`, {
        cuisine: CUISINES[i % CUISINES.length] as string,
        score: 1 - i * 0.01,
        total_minutes: 15 + ((i * 7) % 60),
        ingredientIds: [`ing${i % 5}`, `ing${(i + 1) % 5}`],
      }),
    );
  }
  for (let i = 0; i < 10; i += 1) {
    out.push(
      candidate(`s${i}`, { course: 'snack', cuisine: 'american', score: 0.4, gentle: i % 2 }),
    );
  }
  return out;
}

function cuisineOf(id: string, cands: readonly FillCandidate[]): string {
  return cands.find((c) => c.id === id)?.cuisine ?? '';
}

function checkVariety(result: AutoFillResult, cands: readonly FillCandidate[]) {
  const byDay = new Map<number, string[]>();
  for (const a of result.assignments) {
    byDay.set(a.day, [...(byDay.get(a.day) ?? []), cuisineOf(a.meal.recipeId, cands)]);
  }
  for (let start = 0; start <= 4; start += 1) {
    const counts = new Map<string, number>();
    for (let d = start; d < start + 3; d += 1) {
      for (const c of byDay.get(d) ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(VARIETY_MAX_PER_WINDOW);
  }
}

describe('autoFillWeek', () => {
  it('fills breakfast, lunch and dinner for every day with suitable courses', () => {
    const cands = pool();
    const result = autoFillWeek({ weekStart: WEEK, candidates: cands, servings: 2 });
    expect(result.assignments).toHaveLength(21);
    expect(result.unfilled).toEqual([]);
    for (const a of result.assignments) {
      const course = cands.find((c) => c.id === a.meal.recipeId)?.course;
      expect(a.slot === 'breakfast' ? course === 'breakfast' : course === 'main').toBe(true);
      expect(a.meal).toMatchObject({ servings: 2, portion: 1 });
    }
  });

  it('never repeats a recipe within the week', () => {
    const result = autoFillWeek({ weekStart: WEEK, candidates: pool(), servings: 2 });
    const ids = result.assignments.map((a) => a.meal.recipeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps any cuisine to at most two meals in any three days', () => {
    const cands = pool();
    const result = autoFillWeek({ weekStart: WEEK, candidates: cands, servings: 2 });
    expect(result.relaxed).toEqual([]);
    checkVariety(result, cands);
  });

  it('relaxes cuisine variety only when nothing else fits, and says so', () => {
    const cands = [0, 1, 2, 3].map((i) => candidate(`only${i}`, { cuisine: 'italian' }));
    const result = autoFillWeek({
      weekStart: WEEK,
      candidates: cands,
      servings: 1,
      slots: ['dinner'],
      days: [0, 1, 2],
    });
    expect(result.assignments).toHaveLength(3);
    expect(result.relaxed).toEqual([{ day: 2, slot: 'dinner' }]);
  });

  it('respects per-weekday time budgets', () => {
    const cands = pool();
    const budget = [20, 20, 20, 20, 20, 90, 90];
    const result = autoFillWeek({
      weekStart: WEEK,
      candidates: cands,
      servings: 2,
      maxMinutesPerMeal: budget,
    });
    for (const a of result.assignments) {
      const minutes = cands.find((c) => c.id === a.meal.recipeId)?.total_minutes ?? 0;
      expect(minutes).toBeLessThanOrEqual(budget[a.day] as number);
    }
  });

  it('leaves cells empty when nothing satisfies the hard rules', () => {
    const result = autoFillWeek({
      weekStart: WEEK,
      candidates: [candidate('slow', { total_minutes: 120 })],
      servings: 2,
      slots: ['dinner'],
      days: [0],
      maxMinutesPerMeal: 30,
    });
    expect(result.assignments).toEqual([]);
    expect(result.unfilled).toEqual([{ day: 0, slot: 'dinner' }]);
  });

  it('keeps existing cells and counts them toward variety and repeats', () => {
    const cands = pool();
    const plan: WeekPlan = {
      weekStart: WEEK,
      cells: { [cellKey(0, 'dinner')]: { recipeId: 'm00', servings: 2, portion: 1 } },
      updatedAt: null,
    };
    const result = autoFillWeek({ weekStart: WEEK, candidates: cands, servings: 2, plan });
    expect(result.assignments.find((a) => a.day === 0 && a.slot === 'dinner')).toBeUndefined();
    expect(result.assignments.map((a) => a.meal.recipeId)).not.toContain('m00');
    expect(result.assignments).toHaveLength(20);
  });

  it('counts hand-placed recipes outside the candidates toward cuisine variety when told', () => {
    const cands = [
      candidate('it1', { cuisine: 'italian', score: 0.9 }),
      candidate('mx1', { cuisine: 'mexican', score: 0.1 }),
    ];
    const plan: WeekPlan = {
      weekStart: WEEK,
      cells: {
        [cellKey(0, 'dinner')]: { recipeId: 'handA', servings: 2, portion: 1 },
        [cellKey(1, 'dinner')]: { recipeId: 'handB', servings: 2, portion: 1 },
      },
      updatedAt: null,
    };
    const base = {
      weekStart: WEEK,
      candidates: cands,
      servings: 2,
      plan,
      slots: ['dinner' as const],
    };
    const unknown = autoFillWeek({ ...base, days: [2] });
    expect(unknown.assignments[0]?.meal.recipeId).toBe('it1');
    const known = autoFillWeek({
      ...base,
      days: [2],
      plannedCuisines: { handA: 'italian', handB: 'italian' },
    });
    expect(known.assignments[0]?.meal.recipeId).toBe('mx1');
    expect(known.relaxed).toEqual([]);
  });

  it('breaks ties on adjusted score by recommender score, then id', () => {
    // 'b' has the lower raw score but a goal bonus that brings it level with 'a'.
    const cands = [
      candidate('b', { score: 0.4, goal_tags: ['high_protein'] }),
      candidate('a', { score: 0.5 }),
      candidate('c', { score: 0.5 }),
    ];
    const result = autoFillWeek({
      weekStart: WEEK,
      candidates: cands,
      servings: 1,
      slots: ['dinner'],
      days: [0, 1],
      goals: ['high_protein'],
      weights: { goalPerMatch: 0.1 },
    });
    expect(result.assignments.map((a) => a.meal.recipeId)).toEqual(['a', 'c']);
  });

  it('only fills the requested days', () => {
    const result = autoFillWeek({
      weekStart: WEEK,
      candidates: pool(),
      servings: 2,
      days: [4, 5, 6],
    });
    expect(new Set(result.assignments.map((a) => a.day))).toEqual(new Set<DayIndex>([4, 5, 6]));
  });

  it('prefers recipes matching goals and the pantry', () => {
    const cands = [
      candidate('plain', { score: 0.6, cuisine: 'a' }),
      candidate('goal', { score: 0.5, cuisine: 'b', goal_tags: ['high_fiber', 'high_protein'] }),
      candidate('pantry', {
        score: 0.45,
        cuisine: 'c',
        ingredientIds: ['lentil', 'onion', 'salt'],
      }),
    ];
    const one = (goals: string[], pantryIds: string[]) =>
      autoFillWeek({
        weekStart: WEEK,
        candidates: cands,
        servings: 1,
        slots: ['dinner'],
        days: [0],
        goals,
        pantryIds,
        stapleIds: ['salt'],
      }).assignments[0];
    expect(one([], [])?.meal.recipeId).toBe('plain');
    expect(one(['high_fiber', 'high_protein'], [])?.meal.recipeId).toBe('goal');
    const pantryPick = one([], ['lentil', 'onion']);
    expect(pantryPick?.meal.recipeId).toBe('pantry');
    expect(pantryPick?.reasons).toContain('pantry');
  });

  it('adds snacks and half portions in small appetite mode, favouring gentle recipes', () => {
    const result = autoFillWeek({
      weekStart: WEEK,
      candidates: pool(),
      servings: 1,
      smallAppetite: true,
      days: [0],
    });
    expect(result.assignments.map((a) => a.slot)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'snack',
    ]);
    expect(result.assignments.every((a) => a.meal.portion === 0.5)).toBe(true);
    const snack = result.assignments.find((a) => a.slot === 'snack');
    expect(snack?.reasons).toContain('gentle');
  });

  it('is deterministic regardless of candidate order (property)', () => {
    const cands = pool();
    const base = autoFillWeek({ weekStart: WEEK, candidates: cands, servings: 2 });
    let seed = 3;
    for (let round = 0; round < 10; round += 1) {
      const shuffled = [...cands].sort(() => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280 - 0.5;
      });
      expect(autoFillWeek({ weekStart: WEEK, candidates: shuffled, servings: 2 })).toEqual(base);
    }
  });

  it('ignores duplicate and out-of-range days and slots', () => {
    const cands = pool();
    const clean = autoFillWeek({
      weekStart: WEEK,
      candidates: cands,
      servings: 2,
      days: [0, 2],
      slots: ['lunch', 'dinner'],
    });
    const messy = autoFillWeek({
      weekStart: WEEK,
      candidates: cands,
      servings: 2,
      days: [2, 0, 0, 9, -1, 2.5] as unknown as DayIndex[],
      slots: ['dinner', 'lunch', 'dinner', 'brunch'] as unknown as ('lunch' | 'dinner')[],
    });
    expect(messy).toEqual(clean);
    const cellsFilled = messy.assignments.map((a) => cellKey(a.day, a.slot));
    expect(new Set(cellsFilled).size).toBe(cellsFilled.length);
    expect(cellsFilled).toEqual(['0:lunch', '0:dinner', '2:lunch', '2:dinner']);
  });

  it('updates the ingredient reuse bonus as meals are picked', () => {
    // Two recipes sharing ingredients with the first pick: the reuse bonus must tip the choice.
    const cands = [
      candidate('first', { score: 1, ingredientIds: ['a', 'b'] }),
      candidate('shares', { score: 0.5, cuisine: 'thai', ingredientIds: ['a', 'b'] }),
      candidate('fresh', { score: 0.52, cuisine: 'greek', ingredientIds: ['c', 'd'] }),
    ];
    const result = autoFillWeek({
      weekStart: WEEK,
      candidates: cands,
      servings: 2,
      days: [0],
      slots: ['lunch', 'dinner'],
    });
    expect(result.assignments.map((a) => a.meal.recipeId)).toEqual(['first', 'shares']);
    expect(result.assignments[1]?.score).toBeCloseTo(0.5 + 0.05, 12);
  });
});
