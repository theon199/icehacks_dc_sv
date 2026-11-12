import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { readNotificationAccess, type NotificationAccess } from './notificationPermission';

interface PermissionState {
  /** Null until the first read. Kept between screens so reopening Settings does not flicker. */
  access: NotificationAccess | null;
}

const usePermissionStore = create<PermissionState>()(() => ({ access: null }));

/** Counts reads, so an older read that answers late never replaces a newer one. */
let reads = 0;

/** Reads the permission again and records it; returns what it read. */
export async function refreshNotificationAccess(): Promise<NotificationAccess> {
  reads += 1;
  const read = reads;
  const access = await readNotificationAccess();
  if (read === reads && usePermissionStore.getState().access !== access) {
    usePermissionStore.setState({ access });
  }
  return access;
}

/**
 * The system notification permission as last read. It is read again whenever the calling screen
 * gains focus and whenever the app returns to the foreground, since the person can change it in
 * the Settings app at any time.
 */
export function useNotificationAccess(): NotificationAccess | null {
  const access = usePermissionStore((s) => s.access);

  useFocusEffect(
    useCallback(() => {
      void refreshNotificationAccess();
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshNotificationAccess();
    });
    return () => subscription.remove();
  }, []);

  return access;
}

/** Test hook. */
export function resetNotificationAccessForTests(): void {
  reads = 0;
  usePermissionStore.setState({ access: null });
}
