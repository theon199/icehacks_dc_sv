import { act, render } from '@testing-library/react-native';

import { dailyTargets } from '@/domain/nutrition';
import type { PlanDaysInput } from '@/domain/plan';
import { defaultPreferences } from '@/stores';

import { candidatePool } from '../__fixtures__/recipes';
import { manualScheduler } from '../__fixtures__/scheduler';
import { toDomainPreferences } from '../deps';
import { progressOf, useChunkedPlan, type ChunkedPlanState } from './useChunkedPlan';
import { rankForPlanning, toDayPlanCandidates } from '../model/candidates';

type Clock = ReturnType<typeof manualScheduler>;
type Options = { scheduler: Clock['scheduler']; budgetMs: number };

const pool = toDayPlanCandidates(
  rankForPlanning(candidatePool(), {
    prefs: toDomainPreferences({
      ...defaultPreferences,
      allergensAnswered: true,
      onboardedAt: '2026-11-01T00:00:00.000Z',
    }),
    now: 0,
  }),
);

/** Two days against the reference targets; chunkSize 5 forces the search to yield many times. */
function twoDays(smallAppetite: boolean): PlanDaysInput {
  return { candidates: pool, targets: dailyTargets(), days: 2, smallAppetite, chunkSize: 5 };
}

const REGULAR = twoDays(false);
const SMALL = twoDays(true);

/** Renders the hook inside a throwaway component and keeps every state it reported. */
function Probe({
  input,
  options,
  onState,
}: {
  input: PlanDaysInput | null;
  options: Options;
  onState: (state: ChunkedPlanState) => void;
}) {
  onState(useChunkedPlan(input, options));
  return null;
}

async function mount(input: PlanDaysInput | null, clock: Clock) {
  const options: Options = { scheduler: clock.scheduler, budgetMs: 0 };
  const states: ChunkedPlanState[] = [];
  const record = (state: ChunkedPlanState) => states.push(state);
  const view = await render(<Probe input={input} options={options} onState={record} />);
  return {
    latest: () => states[states.length - 1]!,
    swap: (next: PlanDaysInput) =>
      view.rerender(<Probe input={next} options={options} onState={record} />),
  };
}

/** Advances the clock until the run leaves `running`, returning the progress seen per frame. */
async function runToEnd(clock: Clock, latest: () => ChunkedPlanState): Promise<number[]> {
  const progress: number[] = [];
  let frames = 0;
  while (latest().phase === 'running') {
    frames += 1;
    if (frames > 10_000) throw new Error('planner never finished');
    await act(async () => {
      clock.tick();
    });
    const now = latest();
    if (now.phase === 'running') progress.push(now.progress);
  }
  return progress;
}

describe('two-day plan run', () => {
  test('does nothing while there is no input to plan', async () => {
    const clock = manualScheduler();
    const probe = await mount(null, clock);
    expect(probe.latest()).toEqual({ phase: 'idle' });
    expect(clock.pending()).toBe(0);
  });

  test('climbs from zero over many frames and finishes with three meals a day', async () => {
    const clock = manualScheduler();
    const probe = await mount(REGULAR, clock);
    expect(probe.latest()).toEqual({ phase: 'running', progress: 0 });

    const progress = await runToEnd(clock, probe.latest);
    expect(progress.length).toBeGreaterThan(1);
    progress.forEach((value, i) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      if (i > 0) expect(value).toBeGreaterThanOrEqual(progress[i - 1]!);
    });

    const end = probe.latest();
    if (end.phase !== 'done') throw new Error(`expected a finished plan, got ${end.phase}`);
    expect(end.result.days).toHaveLength(2);
    expect(end.result.days[0]!.meals.map((meal) => meal.slot)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
    ]);
  });

  test('a new input abandons the old run and starts again at zero', async () => {
    const clock = manualScheduler();
    const probe = await mount(REGULAR, clock);
    await act(async () => {
      clock.tick();
    });

    await probe.swap(SMALL);
    expect(probe.latest()).toEqual({ phase: 'running', progress: 0 });
    // Only the new run is still queued.
    expect(clock.pending()).toBe(1);

    await runToEnd(clock, probe.latest);
    const end = probe.latest();
    if (end.phase !== 'done') throw new Error(`expected a finished plan, got ${end.phase}`);
    // Small meals add two snacks to the three main meals.
    expect(end.result.days[0]!.meals).toHaveLength(5);
  });
});

describe('progressOf', () => {
  test.each([
    [{ depth: 3, totalDepth: 6 }, 0.5],
    [{ depth: 9, totalDepth: 6 }, 1],
    [{ depth: 1, totalDepth: 0 }, 0],
  ])('%o reads as %d', (step, expected) => {
    expect(progressOf(step)).toBe(expected);
  });
});
