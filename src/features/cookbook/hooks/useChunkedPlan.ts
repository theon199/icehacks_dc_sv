/**
 * Runs the nutrition-target planner across animation frames and reports its progress, so the
 * search (thousands of expansions) never blocks scrolling or the progress ring.
 */
import { useEffect, useState } from 'react';

import { planDaysSteps, type PlanDaysInput, type PlanDaysResult } from '@/domain/plan';
import { describeError, logger } from '@/lib/logger';

import { frameScheduler, runChunked, type ChunkScheduler } from '../model/runChunked';

export type ChunkedPlanState =
  | { phase: 'idle' }
  | { phase: 'running'; progress: number }
  | { phase: 'done'; result: PlanDaysResult }
  | { phase: 'error'; error: unknown };

/** Progress steps of the search mapped onto 0..1 (one step per meal slot decided). */
export function progressOf(p: { depth: number; totalDepth: number }): number {
  if (!(p.totalDepth > 0)) return 0;
  return Math.min(1, Math.max(0, p.depth / p.totalDepth));
}

/**
 * Starts a run whenever `input` changes (pass a memoised object) and cancels the previous one.
 * `null` input leaves the planner idle.
 */
export function useChunkedPlan(
  input: PlanDaysInput | null,
  scheduler: ChunkScheduler = frameScheduler,
): ChunkedPlanState {
  const [state, setState] = useState<{ input: PlanDaysInput | null; value: ChunkedPlanState }>({
    input: null,
    value: { phase: 'idle' },
  });

  useEffect(() => {
    if (!input) return;
    const run = runChunked(planDaysSteps(input), {
      scheduler,
      onProgress: (p) => setState({ input, value: { phase: 'running', progress: progressOf(p) } }),
    });
    run.done.then(
      (result) => {
        if (result) setState({ input, value: { phase: 'done', result } });
      },
      (error: unknown) => {
        logger.error('cookbook.two_day_plan_failed', describeError(error));
        setState({ input, value: { phase: 'error', error } });
      },
    );
    return () => run.cancel();
  }, [input, scheduler]);

  if (!input) return { phase: 'idle' };
  // A new input that has not started yet reads as just started, never as the old result.
  if (state.input !== input) return { phase: 'running', progress: 0 };
  return state.value;
}
