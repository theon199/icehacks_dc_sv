/**
 * Asking the coach one question: take one front-camera still (when the camera is on), send it
 * with the step and the question, and report the answer or an honest reason there is none. One
 * question at a time; leaving the screen cancels it.
 */
import { onlineManager } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { aiApi, type AiApi, type CoachFacts } from '@/lib/api/ai';
import { isApiError } from '@/lib/api/errors';
import type { RecipeDetail } from '@/lib/catalog';
import { usePreferencesStore } from '@/stores';

import {
  answerReply,
  buildCoachRequest,
  errorReply,
  OFFLINE_REPLY,
  type CoachProfile,
  type CoachReply,
} from '../logic/coachStatus';
import type { CoachStill } from '../services/coachPhoto';

export interface CoachQuestionDeps {
  askCoach: AiApi['askCoach'];
  isOnline: () => boolean;
  /** The person's diet and allergens, read when the question is asked. */
  profile: () => CoachProfile;
}

export const defaultQuestionDeps: CoachQuestionDeps = {
  askCoach: (input, options) => aiApi.askCoach(input, options),
  isOnline: () => onlineManager.isOnline(),
  profile: () => {
    const { prefs } = usePreferencesStore.getState();
    return { diets: prefs.diets, allergens: prefs.allergens };
  },
};

export interface CoachCamera {
  /** True when the camera may be used and its preview is running. */
  on: boolean;
  /** One still from the live preview, or null when none could be taken. */
  capture: () => Promise<CoachStill | null>;
}

const BUSY: CoachReply = {
  status: { kind: 'info', message: 'Still looking at your last question.' },
  say: null,
};

export function useCoachQuestion(
  recipe: RecipeDetail,
  camera: CoachCamera,
  onReply: (reply: CoachReply) => void,
  deps: CoachQuestionDeps = defaultQuestionDeps,
  /** Catalog facts about the recipe, or null while there are none (the server then fails closed). */
  facts: CoachFacts | null = null,
) {
  const inFlight = useRef<AbortController | null>(null);
  const live = useRef({ recipe, camera, onReply, deps, facts });
  useLayoutEffect(() => {
    live.current = { recipe, camera, onReply, deps, facts };
  });

  const ask = useCallback(async (question: string, step: number) => {
    const { camera: lens, deps: api, onReply: report } = live.current;
    if (inFlight.current) {
      report(BUSY);
      return;
    }
    if (!api.isOnline()) {
      report(OFFLINE_REPLY);
      return;
    }
    const controller = new AbortController();
    inFlight.current = controller;
    report({ status: { kind: 'thinking', question }, say: null });
    try {
      let still: CoachStill | null = null;
      if (lens.on) still = await lens.capture().catch(() => null);
      if (controller.signal.aborted) return;
      const withoutPhoto = still ? null : lens.on ? 'capture_failed' : 'camera_off';
      const request = buildCoachRequest(
        live.current.recipe,
        step,
        question,
        api.profile(),
        still?.base64 ?? null,
        live.current.facts,
      );
      const response = await api.askCoach(request, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const photo = still ? { width: still.width, height: still.height } : null;
      const plantOnly = request.facts?.plant_only === true;
      live.current.onReply(answerReply(question, response, photo, withoutPhoto, plantOnly));
    } catch (error) {
      if (controller.signal.aborted || (isApiError(error) && error.kind === 'cancelled')) return;
      live.current.onReply(errorReply(error));
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return { ask, cancel };
}
