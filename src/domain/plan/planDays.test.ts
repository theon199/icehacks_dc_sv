import { dailyTargets, type DailyTargets } from '../nutrition';
import {
  dayDistance,
  DEFAULT_PREFERENCE_WEIGHT,
  explainPlan,
  planDays,
  planDaysSteps,
  planDistance,
  SLOT_COURSES,
  STANDARD_DAY,
  SMALL_APPETITE_DAY,
  type DayPlanCandidate,
  type DaySlotSpec,
  type PlanDaysResult,
} from './index';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A realistic-looking random catalog. Preference scores are deliberately correlated with richer,
 * saltier food so the best-liked picks are not the best nutritional fit.
 */
function catalog(seed: number, size = 120): DayPlanCandidate[] {
  const next = rng(seed);
  const out: DayPlanCandidate[] = [];
  for (let i = 0; i < size; i += 1) {
    const r = next();
    const course = r < 0.25 ? 'breakfast' : r < 0.85 ? 'main' : 'snack';
    const base = course === 'breakfast' ? 350 : course === 'main' ? 600 : 180;
    const rich = next();
    const kcal = base * (0.6 + rich * 0.9);
    out.push({
      id: `r${String(i).padStart(3, '0')}`,
      course,
      score: Math.min(1, 0.2 + rich * 0.7 + next() * 0.1),
      nutrition: {
        kcal,
        protein_g: (kcal / 100) * (2 + next() * 5),
        fiber_g: (kcal / 100) * (0.3 + next() * 1.6),
        sodium_mg: kcal * (0.4 + rich * 1.8),
        sat_fat_g: (kcal / 100) * (0.3 + rich * 1.4),
        added_sugar_g: (kcal / 100) * next() * 2,
      },
    });
  }
  return out;
}

/** Best-liked unused recipe for each slot: what a planner without nutrition awareness would do. */
function naivePlan(
  candidates: readonly DayPlanCandidate[],
  days: number,
  layout: readonly DaySlotSpec[],
): { recipeId: string | null; portion: number }[][] {
  const used = new Set<string>();
  const ranked = [...candidates].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id),
  );
  const out: { recipeId: string | null; portion: number }[][] = [];
  for (let d = 0; d < days; d += 1) {
    out.push(
      layout.map((spec) => {
        const pick = ranked.find(
          (c) => !used.has(c.id) && SLOT_COURSES[spec.slot].includes(c.course),
        );
        if (pick) used.add(pick.id);
        return { recipeId: pick?.id ?? null, portion: spec.portion };
      }),
    );
  }
  return out;
}

function mealsOf(result: PlanDaysResult) {
  return result.days.map((d) => d.meals.map((m) => ({ recipeId: m.recipeId, portion: m.portion })));
}

/**
 * The objective exactly as the module docs define it:
 * Σ_days distance(day) + (λ / S) · Σ_slots p(slot), with p = 1 − score (filled) or 1 (empty).
 */
function documentedObjective(
  result: PlanDaysResult,
  cands: readonly DayPlanCandidate[],
  t: DailyTargets,
  lambda = DEFAULT_PREFERENCE_WEIGHT,
): number {
  const byId = new Map(cands.map((c) => [c.id, c]));
  const meals = result.days.flatMap((d) => d.meals);
  const penalty = meals.reduce((sum, m) => {
    if (m.recipeId === null) return sum + 1;
    const score = byId.get(m.recipeId)?.score ?? 0.5;
    return sum + (1 - Math.min(1, Math.max(0, score)));
  }, 0);
  return planDistance(mealsOf(result), cands, t) + (lambda / meals.length) * penalty;
}

const targets: DailyTargets = dailyTargets({
  age: 35,
  sex: 'female',
  heightCm: 168,
  weightKg: 64,
  activity: 'light',
});

describe('dayDistance', () => {
  it('is zero on target and penalises each kind of miss', () => {
    const onTarget = {
      kcal: targets.kcal,
      protein_g: targets.protein_g,
      fiber_g: targets.fiber_g,
      sodium_mg: 0,
      sat_fat_g: 0,
      added_sugar_g: 0,
    };
    expect(dayDistance(onTarget, targets)).toBe(0);
    // Extra protein and fiber are free; extra energy and excess sodium are not.
    expect(dayDistance({ ...onTarget, protein_g: targets.protein_g * 2 }, targets)).toBe(0);
    expect(dayDistance({ ...onTarget, kcal: targets.kcal * 1.2 }, targets)).toBeCloseTo(3 * 0.04);
    expect(dayDistance({ ...onTarget, kcal: targets.kcal * 0.8 }, targets)).toBeCloseTo(3 * 0.04);
    expect(dayDistance({ ...onTarget, sodium_mg: targets.sodium_mg * 1.5 }, targets)).toBeCloseTo(
      1.5 * 0.25,
    );
    expect(dayDistance({ ...onTarget, fiber_g: targets.fiber_g / 2 }, targets)).toBeCloseTo(
      1.5 * 0.25,
    );
    expect(dayDistance({ ...onTarget, sodium_mg: targets.sodium_mg }, targets)).toBe(0);
  });

  it('scales targets for a partial day', () => {
    // Half the day's energy at half a day is on target; missing protein and fiber cost 2 + 1.5.
    expect(dayDistance({ kcal: targets.kcal / 2 }, targets, 0.5)).toBeCloseTo(3.5, 10);
  });
});

describe('planDays', () => {
  it('fills two days of breakfast, lunch and dinner with distinct suitable recipes', () => {
    const cands = catalog(1);
    const result = planDays({ candidates: cands, targets });
    expect(result.days).toHaveLength(2);
    const ids: string[] = [];
    for (const day of result.days) {
      expect(day.meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
      for (const m of day.meals) {
        expect(m.recipeId).not.toBeNull();
        const course = cands.find((c) => c.id === m.recipeId)?.course ?? '';
        expect(SLOT_COURSES[m.slot]).toContain(course);
        ids.push(m.recipeId as string);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stays within the expansion budget and beam width', () => {
    const result = planDays({ candidates: catalog(2, 400), targets });
    expect(result.search.expansions).toBeLessThanOrEqual(4000);
    expect(result.search.beamWidth).toBe(12);
    expect(result.search.truncated).toBe(false);
  });

  it('is deterministic: same plan for the same input in any order (property)', () => {
    const cands = catalog(3);
    const base = planDays({ candidates: cands, targets });
    const next = rng(99);
    for (let i = 0; i < 5; i += 1) {
      const shuffled = [...cands]
        .map((c) => ({ c, k: next() }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.c);
      expect(planDays({ candidates: shuffled, targets })).toEqual(base);
    }
  });

  it('gets closer to the targets than picking the best-liked recipes (property)', () => {
    for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) {
      const cands = catalog(seed);
      const result = planDays({ candidates: cands, targets });
      const planned = planDistance(mealsOf(result), cands, targets);
      const naive = planDistance(naivePlan(cands, 2, STANDARD_DAY), cands, targets);
      expect(planned).toBeLessThan(naive);
      // Reported per-day distances add up to the plan's nutrition distance.
      const sum = result.days.reduce((s, d) => s + d.distance, 0);
      expect(sum).toBeCloseTo(planned, 8);
    }
  });

  it('finds the obviously right plan on a small hand-made catalog', () => {
    const t: DailyTargets = { ...dailyTargets(), kcal: 2000, protein_g: 60, fiber_g: 28 };
    const good = (id: string, course: string, kcal: number): DayPlanCandidate => ({
      id,
      course,
      score: 0.3,
      nutrition: {
        kcal,
        protein_g: kcal * 0.03,
        fiber_g: kcal * 0.014,
        sodium_mg: kcal * 0.8,
        sat_fat_g: kcal * 0.008,
        added_sugar_g: 0,
      },
    });
    const junk = (id: string, course: string): DayPlanCandidate => ({
      id,
      course,
      score: 1,
      nutrition: {
        kcal: 1400,
        protein_g: 10,
        fiber_g: 1,
        sodium_mg: 3000,
        sat_fat_g: 40,
        added_sugar_g: 60,
      },
    });
    const cands = [
      good('b1', 'breakfast', 500),
      good('b2', 'breakfast', 500),
      good('l1', 'main', 700),
      good('l2', 'main', 700),
      good('d1', 'main', 800),
      good('d2', 'main', 800),
      junk('jb', 'breakfast'),
      junk('jm', 'main'),
      junk('jm2', 'main'),
    ];
    const result = planDays({ candidates: cands, targets: t });
    const chosen = result.days.flatMap((d) => d.meals.map((m) => m.recipeId));
    expect(chosen.some((id) => id?.startsWith('j'))).toBe(false);
    for (const day of result.days) {
      expect(day.status.kcal).toBe('on_target');
      expect(day.status.sodium_mg).toBe('within');
    }
  });

  it('can be run in chunks and gives the same answer', () => {
    const cands = catalog(4, 300);
    const steps = planDaysSteps({ candidates: cands, targets, chunkSize: 100 });
    let yields = 0;
    let last = 0;
    let r = steps.next();
    while (!r.done) {
      yields += 1;
      expect(r.value.expansions).toBeGreaterThan(last);
      expect(r.value.totalDepth).toBe(6);
      last = r.value.expansions;
      r = steps.next();
    }
    expect(yields).toBeGreaterThan(5);
    expect(r.value).toEqual(planDays({ candidates: cands, targets, chunkSize: 100 }));
  });

  it('completes greedily when the expansion budget is tiny', () => {
    const cands = catalog(5);
    const result = planDays({ candidates: cands, targets, maxExpansions: 20 });
    expect(result.search.truncated).toBe(true);
    expect(result.search.expansions).toBeLessThanOrEqual(20);
    expect(result.days.every((d) => d.meals.every((m) => m.recipeId !== null))).toBe(true);
    expect(result.explanation).toContainEqual({ kind: 'truncated', expansions: 20 });
  });

  it('adds snacks and half portions in small appetite mode', () => {
    const cands = catalog(6);
    const result = planDays({ candidates: cands, targets, smallAppetite: true });
    for (const day of result.days) {
      expect(day.meals.map((m) => m.slot)).toEqual(SMALL_APPETITE_DAY.map((s) => s.slot));
      expect(day.meals.map((m) => m.portion)).toEqual([0.5, 1, 0.5, 1, 0.5]);
    }
    const naive = planDistance(naivePlan(cands, 2, SMALL_APPETITE_DAY), cands, targets);
    expect(planDistance(mealsOf(result), cands, targets)).toBeLessThan(naive);
  });

  it('plans other day counts', () => {
    const result = planDays({ candidates: catalog(7), targets, days: 3 });
    expect(result.days).toHaveLength(3);
    expect(planDays({ candidates: catalog(7), targets, days: 0 }).days).toHaveLength(1);
  });

  it('excludes recipes without energy and estimates other gaps', () => {
    const cands: DayPlanCandidate[] = [
      ...catalog(8, 40),
      { id: 'nokcal', course: 'main', score: 1, nutrition: { kcal: null, protein_g: 50 } },
      { id: 'partial', course: 'main', score: 1, nutrition: { kcal: 700, protein_g: 45 } },
    ];
    const result = planDays({ candidates: cands, targets });
    expect(result.search.excluded).toEqual(['nokcal']);
    expect(result.explanation).toContainEqual({ kind: 'excluded', count: 1 });
    const chosen = result.days.flatMap((d) => d.meals.map((m) => m.recipeId));
    expect(chosen).not.toContain('nokcal');
    if (chosen.includes('partial')) {
      expect(result.explanation).toContainEqual({ kind: 'estimated', recipeIds: ['partial'] });
      const day = result.days.find((d) => d.meals.some((m) => m.recipeId === 'partial'));
      expect(day?.incomplete).toContain('sodium_mg');
    }
  });

  it('reports empty slots when the catalog runs out', () => {
    const cands = catalog(9, 60).filter((c) => c.course !== 'breakfast');
    const result = planDays({ candidates: cands, targets });
    expect(result.days.every((d) => d.meals[0]?.recipeId === null)).toBe(true);
    expect(result.explanation).toContainEqual({ kind: 'empty_slot', day: 0, slot: 'breakfast' });
  });

  it('explains the plan in plain English', () => {
    const result = planDays({ candidates: catalog(10), targets });
    const lines = explainPlan(result);
    expect(lines.length).toBeGreaterThanOrEqual(12);
    expect(lines[0]).toMatch(
      /^Day 1: Energy \d+ kcal (below|close to|above) the \d+ kcal target\.$/,
    );
    expect(lines.some((l) => /Sodium \d+ mg (stays within|above) the \d+ mg limit/.test(l))).toBe(
      true,
    );
  });

  it('handles an empty catalog', () => {
    const result = planDays({ candidates: [], targets });
    expect(result.days.every((d) => d.meals.every((m) => m.recipeId === null))).toBe(true);
    expect(Number.isFinite(result.objective)).toBe(true);
  });
  it('reports the objective defined in the module docs (property)', () => {
    for (const seed of [21, 22, 23]) {
      const cands = catalog(seed);
      for (const smallAppetite of [false, true]) {
        const result = planDays({ candidates: cands, targets, smallAppetite });
        expect(result.objective).toBeCloseTo(documentedObjective(result, cands, targets), 10);
      }
    }
    const weighted = planDays({ candidates: catalog(24), targets, preferenceWeight: 0.6 });
    expect(weighted.objective).toBeCloseTo(
      documentedObjective(weighted, catalog(24), targets, 0.6),
      10,
    );
  });

  it('counts an empty slot as a preference penalty of 1 in the objective', () => {
    const cands = catalog(9, 60).filter((c) => c.course !== 'breakfast');
    const result = planDays({ candidates: cands, targets });
    const empty = result.days.flatMap((d) => d.meals).filter((m) => m.recipeId === null);
    expect(empty.length).toBe(2);
    expect(result.objective).toBeCloseTo(documentedObjective(result, cands, targets), 10);
  });

  it('keeps the same candidate for a duplicated id whatever the input order', () => {
    const cands = catalog(25, 60);
    const first = cands[0] as DayPlanCandidate;
    const twin: DayPlanCandidate = {
      ...first,
      score: 0,
      nutrition: { ...first.nutrition, kcal: 1 },
    };
    const a = planDays({ candidates: [...cands, twin], targets });
    const b = planDays({ candidates: [twin, ...cands], targets });
    expect(a).toEqual(b);
    expect(a.search.candidatesConsidered).toBe(cands.length);
  });

  it('falls back to the reference targets when the energy target is unusable', () => {
    const cands = catalog(31, 60);
    const reference = planDays({ candidates: cands, targets: dailyTargets() });
    for (const kcal of [0, -500, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = planDays({ candidates: cands, targets: { ...targets, kcal } });
      expect(Number.isFinite(result.objective)).toBe(true);
      expect(result).toEqual(reference);
    }
  });

  it('drops other targets that are not finite instead of producing NaN', () => {
    const cands = catalog(32, 60);
    const broken: DailyTargets = { ...targets, sodium_mg: Number.NaN, fiber_g: -1 };
    const result = planDays({ candidates: cands, targets: broken });
    expect(Number.isFinite(result.objective)).toBe(true);
    expect(result.days.every((d) => Number.isFinite(d.distance))).toBe(true);
    expect(Number.isFinite(planDistance(mealsOf(result), cands, broken))).toBe(true);
  });
});
