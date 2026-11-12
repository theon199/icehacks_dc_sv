/**
 * This device's record of "did they have it?" answers, used to allow one answer per place and
 * dish per day. Kept locally: the server holds the answers themselves.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { versionedPersist } from '@/stores/persistence';

import { withConfirmation, withoutConfirmation, type ConfirmationLog } from './model/confirmations';

const logSchema = z.record(
  z.string(),
  z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hadIt: z.boolean() }),
);

interface PersistedConfirmations {
  log: ConfirmationLog;
}

export interface ConfirmationState extends PersistedConfirmations {
  /** Records today's answer; returns false when one already exists for today. */
  record: (key: string, hadIt: boolean, now?: Date) => boolean;
  /** Forgets an answer the server did not accept. */
  forget: (key: string) => void;
}

export const useConfirmationStore = create<ConfirmationState>()(
  persist(
    (set, get) => ({
      log: {},
      record: (key, hadIt, now = new Date()) => {
        const before = get().log;
        const after = withConfirmation(before, key, hadIt, now);
        if (after === before) return false;
        set({ log: after });
        return true;
      },
      forget: (key) => set((state) => ({ log: withoutConfirmation(state.log, key) })),
    }),
    versionedPersist<ConfirmationState, PersistedConfirmations>({
      name: 'nearby.confirmations',
      version: 1,
      schema: z.object({ log: logSchema }),
      partialize: (state) => ({ log: state.log }),
    }),
  ),
);

export const selectConfirmationLog = (state: ConfirmationState) => state.log;
