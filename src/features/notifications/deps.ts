/**
 * Narrow adapter over modules other work items own, so swapping in the real module is a one-file
 * change.
 *
 * Push preference: the "Notifications" switch in Settings (docs/PRODUCT.md §18) lives in the
 * settings store. Until that store is available, this keeps the same value in a small persisted
 * slice. The interface is what the inbox needs: read the switch, react to it, and flip it from the
 * opt-in card.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '@/lib/storage/kv';

interface PushPreferenceState {
  /** Famara-level permission to send pushes; the OS permission is checked separately. */
  pushEnabled: boolean;
  setPushEnabled: (enabled: boolean) => void;
}

const PersistedSchema = z.object({ pushEnabled: z.boolean() });

const usePushPreferenceStore = create<PushPreferenceState>()(
  persist(
    (set) => ({
      pushEnabled: true,
      setPushEnabled: (enabled) => set({ pushEnabled: enabled }),
    }),
    {
      name: 'notifications.pushPreference',
      version: 1,
      storage: persistStorage<{ pushEnabled: boolean }>(),
      partialize: (state) => ({ pushEnabled: state.pushEnabled }),
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
    },
  ),
);

export function usePushEnabled(): boolean {
  return usePushPreferenceStore((s) => s.pushEnabled);
}

export function getPushEnabled(): boolean {
  return usePushPreferenceStore.getState().pushEnabled;
}

export function setPushEnabled(enabled: boolean): void {
  usePushPreferenceStore.getState().setPushEnabled(enabled);
}
