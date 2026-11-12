/**
 * Pull-to-refresh plumbing for the profile and friends screens: runs a reload task and reports
 * whether the spinner should show while it is in flight.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { profileKeys } from './queryKeys';
import { useMyUserId } from './useProfileData';

export interface PullRefresh {
  refreshing: boolean;
  refresh: () => void;
}

/** Wraps an async reload so overlapping pulls share one spinner and errors never escape. */
export function usePullRefresh(reload: () => Promise<unknown>): PullRefresh {
  const [inFlight, setInFlight] = useState(0);

  const refresh = () => {
    setInFlight((count) => count + 1);
    void reload()
      .catch(() => undefined) // each query shows its own error state
      .finally(() => setInFlight((count) => count - 1));
  };

  return { refreshing: inFlight > 0, refresh };
}

/** Reloads the signed-in person's profile row, stats and posts. */
export function useProfileRefresh(): PullRefresh {
  const queryClient = useQueryClient();
  const userId = useMyUserId();
  return usePullRefresh(async () => {
    if (!userId) return;
    const keys = [profileKeys.me(userId), profileKeys.statsAll(userId), profileKeys.posts(userId)];
    await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  });
}

/**
 * Reloads the follow lists, then the suggestions. Suggestions are fetched from the people I follow
 * and ranked against both lists, so refreshing them before the lists land would rank stale data.
 */
export function useFriendsRefresh(): PullRefresh {
  const queryClient = useQueryClient();
  const userId = useMyUserId();
  return usePullRefresh(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({ queryKey: profileKeys.follows(userId) });
    await queryClient.invalidateQueries({ queryKey: profileKeys.suggestions(userId) });
  });
}
