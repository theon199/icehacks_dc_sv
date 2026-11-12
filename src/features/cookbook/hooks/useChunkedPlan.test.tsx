import { act, renderHook } from '@testing-library/react-native';

import { dailyTargets } from '@/domain/nutrition';
import type { PlanDaysInput } from '@/domain/plan';
import { defaultPreferences } from '@/stores';

import { candidatePool } from '../__fixtures__/recipes';
import { manualScheduler } from '../__fixtures__/scheduler';
import { toDomainPreferences } from '../deps';
import { progressOf, useChunkedPlan } from './useChunkedPlan';
import { rankForPlanning, toDayPlanCandidates } from '../model/candidates';

const prefs = toDomainPreferences({
  ...defaultPreferences,
  allergensAnswered: true,
  onboardedAt: '2026-11-01T00:00:00.000Z',
});
const candidates = toDayPlanCandidates(rankForPlanning(candidatePool(), { prefs, now: 0 }));

function input(smallAppetite = false): PlanDaysInput {
  // A tiny chunk size makes the search yield often, so it needs many slices.
  return { candidates, targets: dailyTargets(), days: 2, smallAppetite, chunkSize: 5 };
}

const standard = input(false);
const smallInput = input(true);

/** Run slices until the planner settles, collecting the progress shown after each. */
async function drain(
  tick: () => void,
  read: () => ReturnType<typeof useChunkedPlan>,
): Promise<number[]> {
  const seen: number[] = [];
  for (let i = 0; i < 10_000 && read().phase === 'running'; i += 1) {
    await act(async () => {
      tick();
    });
    const state = read();
    if (state.phase === 'running') seen.push(state.progress);
  }
  return seen;
}

describe('useChunkedPlan', () => {
  it('stays idle without input', async () => {
    const { result } = await renderHook(() =>
      useChunkedPlan(null, { scheduler: manualScheduler().scheduler, budgetMs: 0 }),
    );
    expect(result.current).toEqual({ phase: 'idle' });
  });

  it('reports rising progress across frames, then the plan', async () => {
    const clock = manualScheduler();
    const options = { scheduler: clock.scheduler, budgetMs: 0 };
    const plan = input();
    const { result } = await renderHook(() => useChunkedPlan(plan, options));
    expect(result.current).toEqual({ phase: 'running', progress: 0 });

    const seen = await drain(clock.tick, () => result.current);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen.every((p) => p >= 0 && p <= 1)).toBe(true);

    const done = result.current;
    expect(done.phase).toBe('done');
    if (done.phase !== 'done') return;
    expect(done.result.days).toHaveLength(2);
    expect(done.result.days[0]!.meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  it('restarts from zero when the input changes and drops the old run', async () => {
    const clock = manualScheduler();
    const options = { scheduler: clock.scheduler, budgetMs: 0 };
    const { result, rerender } = await renderHook(
      ({ small }: { small: boolean }) => useChunkedPlan(small ? smallInput : standard, options),
      { initialProps: { small: false } },
    );
    await act(async () => clock.tick());
    await rerender({ small: true });
    expect(result.current).toEqual({ phase: 'running', progress: 0 });
    expect(clock.pending()).toBe(1);

    await drain(clock.tick, () => result.current);
    const done = result.current;
    expect(done.phase).toBe('done');
    if (done.phase === 'done') expect(done.result.days[0]!.meals).toHaveLength(5);
  });

  it('maps search depth onto 0..1', () => {
    expect(progressOf({ depth: 3, totalDepth: 6 })).toBe(0.5);
    expect(progressOf({ depth: 9, totalDepth: 6 })).toBe(1);
    expect(progressOf({ depth: 1, totalDepth: 0 })).toBe(0);
  });
});
