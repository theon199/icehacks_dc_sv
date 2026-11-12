/**
 * The step on screen, remembered on this device so stepping away mid-recipe (a phone call, closing
 * cook mode by accident) picks up where the person left off. Only the most recent recipe is kept,
 * and only for a few hours: after that a fresh start is the better guess.
 */
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

import { defineKvKey } from '@/lib/storage/kv';

import { clampStep } from '../logic/session';

const RESUME_WINDOW_MS = 6 * 60 * 60 * 1000;

const lastPosition = defineKvKey(
  'cook.lastPosition',
  z.object({ recipeId: z.string(), step: z.number().int().min(0), at: z.number() }),
);

function readResumeStep(recipeId: string, now: number): number {
  try {
    const saved = lastPosition.getSync();
    if (saved && saved.recipeId === recipeId && now - saved.at < RESUME_WINDOW_MS)
      return saved.step;
  } catch {
    // Storage unavailable: start at the top.
  }
  return 0;
}

export function useStepPosition(recipeId: string, stepCount: number) {
  const [step, setStep] = useState(() => readResumeStep(recipeId, Date.now()));
  const current = clampStep(step, stepCount);

  useEffect(() => {
    if (!recipeId || stepCount === 0) return;
    try {
      lastPosition.setSync({ recipeId, step: current, at: Date.now() });
    } catch {
      // Remembering the step is a convenience only.
    }
  }, [recipeId, stepCount, current]);

  const goTo = useCallback((index: number) => setStep(clampStep(index, stepCount)), [stepCount]);

  /** Forget the position once the dish is finished. */
  const clear = useCallback(() => {
    void lastPosition.remove().catch(() => undefined);
  }, []);

  return { step: current, goTo, clear };
}
