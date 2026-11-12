/**
 * Retries cooks the server has not heard about yet, for the signed-in account, whenever a cook
 * screen opens. Delivered cooks change the profile stats and badges, so those are refreshed.
 */
import { useEffect } from 'react';

import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';

import { refreshProfileStats } from '../deps';
import { classifyCookEventError, recordCookEvent } from '../services/cookEvents';
import { flushPendingCookEvents, usePendingCookEvents } from '../services/pendingCookEvents';

export function useFlushPendingCooks() {
  const userId = useSessionStore((state) => (state.status === 'ready' ? state.userId : null));
  const hasPending = usePendingCookEvents((state) =>
    userId ? state.events.some((event) => event.ownerId === userId) : false,
  );

  useEffect(() => {
    if (!userId || !hasPending) return;
    flushPendingCookEvents(userId, {
      recordCookEvent,
      classifyFailure: classifyCookEventError,
    })
      .then((delivered) => {
        if (delivered > 0) refreshProfileStats(userId);
      })
      .catch((error: unknown) => logger.warn('Could not send queued cooks', describeError(error)));
  }, [hasPending, userId]);
}
