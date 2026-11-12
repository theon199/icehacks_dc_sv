/**
 * Saves a finished cook from the completion screen: cook log, recommendation feedback and the
 * server's cook event (queued when offline or when the server is slow to answer). Saving twice from
 * one screen is a no-op the second time, so "Save" followed by "Share" logs once.
 */
import { useCallback, useRef, useState } from 'react';

import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';
import { useCookLogStore, useFeedbackStore } from '@/stores';
import { toast } from '@/ui';

import { refreshProfileStats } from '../deps';
import {
  badgeMessage,
  completeCook,
  type CompletionDeps,
  type CompletionOutcome,
  type CookCompletion,
  type CookEventRequest,
} from '../logic/completion';
import { localDateString } from '../logic/session';
import { classifyCookEventError, recordCookEvent } from '../services/cookEvents';
import { usePendingCookEvents } from '../services/pendingCookEvents';

/**
 * Sends the cook to the server. Whenever the server accepts it, even after Save stopped waiting
 * and queued it, the queued copy is no longer needed and the profile stats are out of date.
 * Badges in an answer that arrives after Save already queued the cook are not announced: the
 * person has usually left the screen by then, and the refreshed profile shows the badges anyway.
 */
async function sendCookEvent(userId: string, request: CookEventRequest) {
  const response = await recordCookEvent(request, userId);
  usePendingCookEvents.getState().remove(request.clientEventId);
  refreshProfileStats(userId);
  return response;
}

export function completionDeps(userId: string | null): CompletionDeps {
  return {
    logCook: (entry, at) => useCookLogStore.getState().log(entry, at),
    recordFeedback: (event, at) => useFeedbackStore.getState().record(event, at),
    recordCookEvent: (request) =>
      userId ? sendCookEvent(userId, request) : Promise.reject(new Error('signed out')),
    classifyFailure: classifyCookEventError,
    // Signed out there is no account to deliver to later: the cook stays local only. Save can
    // reach this only after waiting for the server, so the account is checked again here: a
    // sign-out (or a switch to another account) in the meantime must not queue the cook under the
    // account that has left.
    enqueue: (request) => {
      if (!userId || useSessionStore.getState().userId !== userId) return false;
      usePendingCookEvents.getState().add(userId, request);
      return true;
    },
    localDate: localDateString,
  };
}

export function useCompleteCook() {
  const userId = useSessionStore((state) => (state.status === 'ready' ? state.userId : null));
  const [saving, setSaving] = useState(false);
  const result = useRef<Promise<CompletionOutcome> | null>(null);

  const save = useCallback(
    (completion: CookCompletion): Promise<CompletionOutcome> => {
      if (result.current) return result.current;
      setSaving(true);
      const run = completeCook(completion, completionDeps(userId))
        .then((outcome) => {
          if (outcome.status === 'synced') {
            const badges = badgeMessage(outcome.newBadges);
            if (badges) toast.show({ message: badges, tone: 'success' });
          }
          return outcome;
        })
        .catch((error: unknown) => {
          // Local writes cannot fail in practice; never let a surprise block leaving the screen.
          logger.error('Saving a cook failed', describeError(error));
          return { status: 'local_only', entryId: null } satisfies CompletionOutcome;
        })
        .finally(() => setSaving(false));
      result.current = run;
      return run;
    },
    [userId],
  );

  return { save, saving };
}
