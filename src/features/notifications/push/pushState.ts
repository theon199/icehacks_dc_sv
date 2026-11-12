/** Per-device push bookkeeping: the last registration sent to the server and the offer history. */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '@/lib/storage/kv';

import { EMPTY_PROMPT_HISTORY, type PromptHistory, type RegistrationRecord } from './pushPolicy';

interface PushState {
  registration: RegistrationRecord | null;
  prompt: PromptHistory;
  setRegistration: (registration: RegistrationRecord | null) => void;
  setPrompt: (prompt: PromptHistory) => void;
}

const PersistedSchema = z.object({
  registration: z
    .object({ token: z.string(), userId: z.string(), at: z.number() })
    .nullable()
    .catch(null),
  prompt: z
    .object({
      dismissals: z.number().int().nonnegative(),
      lastDismissedAt: z.number().nullable(),
      optedOut: z.boolean(),
    })
    .catch(EMPTY_PROMPT_HISTORY),
});

type Persisted = z.infer<typeof PersistedSchema>;

export const usePushState = create<PushState>()(
  persist(
    (set) => ({
      registration: null,
      prompt: EMPTY_PROMPT_HISTORY,
      setRegistration: (registration) => set({ registration }),
      setPrompt: (prompt) => set({ prompt }),
    }),
    {
      name: 'notifications.push',
      version: 1,
      storage: persistStorage<Persisted>(),
      partialize: (state) => ({ registration: state.registration, prompt: state.prompt }),
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
    },
  ),
);
