/**
 * Saves a finished cook from the completion screen: cook log, recommendation feedback and the
 * server's cook event (queued when offline). Saving twice from one screen is a no-op the second
 * time, so "Save" followed by "Share" logs once.
 */
import { useCallback, useRef, useState } from 'react';

import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';
import { useCookLogStore, useFeedbackStore } from '@/stores';
import { toast } from '@/ui';

import {
  badgeMessage,
  completeCook,
  type CompletionDeps,
  type CompletionOutcome,
  type CookCompletion,
} from '../logic/completion';
import { localDateString } from '../logic/session';
import { classifyCookEventError, recordCookEvent } from '../services/cookEvents';
import { usePendingCookEvents } from '../services/pendingCookEvents';

function storeDeps(userId: string | null): CompletionDeps {
  return {
    logCook: (entry, at) => useCookLogStore.getState().log(entry, at),
    recordFeedback: (event, at) => useFeedbackStore.getState().record(event, at),
    recordCookEvent: (request) =>
      userId ? recordCookEvent(request) : Promise.reject(new Error('signed out')),
    classifyFailure: classifyCookEventError,
    enqueue: (request) => {
      if (userId) usePendingCookEvents.getState().add(userId, request);
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
      const run = completeCook(completion, storeDeps(userId))
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
