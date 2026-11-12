/**
 * Names of people this member blocked. Blocking hides profiles in both directions (RLS), so the
 * blocked list cannot look names up afterwards; the name is remembered on this device at the
 * moment of blocking. Entries without a name show a neutral label and still unblock correctly.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '@/lib/storage/kv';

export interface BlockedPerson {
  displayName: string;
  handle: string | null;
}

interface BlockedDirectoryState {
  /** Keyed by `${blockerId}:${blockedId}` so accounts sharing a device stay separate. */
  people: Record<string, BlockedPerson>;
  remember: (blockerId: string, blockedId: string, person: BlockedPerson) => void;
  forget: (blockerId: string, blockedId: string) => void;
}

const PersonSchema = z.object({
  displayName: z.string().max(100),
  handle: z.string().max(40).nullable(),
});
const PersistedSchema = z.object({ people: z.record(z.string(), PersonSchema) });

const key = (blockerId: string, blockedId: string) => `${blockerId}:${blockedId}`;

export const useBlockedDirectory = create<BlockedDirectoryState>()(
  persist(
    (set) => ({
      people: {},
      remember: (blockerId, blockedId, person) =>
        set((state) => ({ people: { ...state.people, [key(blockerId, blockedId)]: person } })),
      forget: (blockerId, blockedId) =>
        set((state) => {
          const people = { ...state.people };
          delete people[key(blockerId, blockedId)];
          return { people };
        }),
    }),
    {
      name: 'moderation.blockedDirectory',
      version: 1,
      storage: persistStorage<z.infer<typeof PersistedSchema>>(),
      partialize: (state) => ({ people: state.people }),
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted);
        return parsed.success ? { ...current, people: parsed.data.people } : current;
      },
    },
  ),
);

export function lookupBlocked(
  people: Record<string, BlockedPerson>,
  blockerId: string,
  blockedId: string,
): BlockedPerson | null {
  return people[key(blockerId, blockedId)] ?? null;
}
