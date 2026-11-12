/**
 * Runs the nutrition-target planner across animation frames and reports its progress, so the
 * search (thousands of expansions) never blocks scrolling or the progress ring.
 */
import { useEffect, useState } from 'react';

import { planDaysSteps, type PlanDaysInput, type PlanDaysResult } from '@/domain/plan';
import { describeError, logger } from '@/lib/logger';

import {
  frameScheduler,
  runChunked,
  type ChunkScheduler,
  type FrameHandle,
} from '../model/runChunked';

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

export interface ChunkedPlanOptions<H> {
  scheduler: ChunkScheduler<H>;
  /** Milliseconds of planning per frame. */
  budgetMs: number;
}

const FRAME_OPTIONS: ChunkedPlanOptions<FrameHandle> = { scheduler: frameScheduler, budgetMs: 8 };

function startPlan<H>(
  input: PlanDaysInput,
  { scheduler, budgetMs }: ChunkedPlanOptions<H>,
  onProgress: (progress: number) => void,
) {
  return runChunked(planDaysSteps(input), {
    scheduler,
    budgetMs,
    onProgress: (p) => onProgress(progressOf(p)),
  });
}

/**
 * Starts a run whenever `input` changes (pass a memoised object) and cancels the previous one.
 * `options` must be stable too; without it the run is paced by animation frames.
 * `null` input leaves the planner idle.
 */
export function useChunkedPlan<H>(
  input: PlanDaysInput | null,
  options?: ChunkedPlanOptions<H>,
): ChunkedPlanState {
  const [state, setState] = useState<{ input: PlanDaysInput | null; value: ChunkedPlanState }>({
    input: null,
    value: { phase: 'idle' },
  });

  useEffect(() => {
    if (!input) return;
    const report = (progress: number) => setState({ input, value: { phase: 'running', progress } });
    const run = options
      ? startPlan(input, options, report)
      : startPlan(input, FRAME_OPTIONS, report);
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
  }, [input, options]);

  if (!input) return { phase: 'idle' };
  // A new input that has not started yet reads as just started, never as the old result.
  if (state.input !== input) return { phase: 'running', progress: 0 };
  return state.value;
}
