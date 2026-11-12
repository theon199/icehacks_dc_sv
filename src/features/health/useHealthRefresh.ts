import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSessionStore } from '@/features/auth';

import { useCookLogSettled } from './deps';
import { useHealthStore } from './healthStore';
import {
  refreshHealth,
  refreshHealthOnceCookLogSettles,
  retryPendingHealthRemoval,
} from './refresh';

/**
 * Keeps health data current while Health is on: claims the stored data for the signed-in person,
 * refreshes on mount and whenever the app returns to the foreground, and once more after the first
 * sync when the cook log was not ready for an earlier refresh. Nothing runs in the background. Safe to mount from several screens; refreshes are shared and throttled. Also
 * finishes removing synced summaries when an earlier removal failed (even with Health off).
 */
export function useHealthRefresh(): void {
  const enabled = useHealthStore((state) => state.enabled);
  const userId = useSessionStore((state) => state.userId);
  const removalPending = useHealthStore((state) => state.removalPendingFor !== null);
  const cookLogSettled = useCookLogSettled();

  useEffect(() => {
    if (userId) useHealthStore.getState().claimFor(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId || !removalPending) return;
    void retryPendingHealthRemoval();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void retryPendingHealthRemoval();
    });
    return () => subscription.remove();
  }, [userId, removalPending]);

  useEffect(() => {
    if (!enabled) return;
    void refreshHealth();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void refreshHealth();
    });
    return () => subscription.remove();
  }, [enabled]);

  useEffect(() => {
    if (enabled && cookLogSettled) void refreshHealthOnceCookLogSettles();
  }, [enabled, cookLogSettled]);
}
