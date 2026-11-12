/**
 * The compose draft, persisted on this device so a half-written post survives closing the sheet or
 * the app. One draft per signed-in person; a draft that belongs to someone else is never shown.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '@/lib/storage/kv';

import { composeDraftSchema, emptyDraft, type ComposeDraft } from '../logic/compose';

interface DraftState {
  ownerId: string | null;
  draft: ComposeDraft;
  /** Makes sure the draft belongs to `ownerId`, starting a fresh one otherwise. */
  claim: (ownerId: string) => void;
  update: (patch: Partial<ComposeDraft>) => void;
  reset: () => void;
}

type PersistedDraft = Pick<DraftState, 'ownerId' | 'draft'>;

export const useComposeDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      ownerId: null,
      draft: emptyDraft,
      claim: (ownerId) => {
        if (get().ownerId !== ownerId) set({ ownerId, draft: emptyDraft });
      },
      update: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
      reset: () => set({ draft: emptyDraft }),
    }),
    {
      name: 'community.composeDraft',
      version: 1,
      storage: persistStorage<PersistedDraft>(),
      partialize: (state) => ({ ownerId: state.ownerId, draft: state.draft }),
      // Anything that fails validation (an older shape, a damaged value) starts a fresh draft.
      merge: (persisted, current) => {
        const value = persisted as Partial<PersistedDraft> | undefined;
        const draft = composeDraftSchema.safeParse(value?.draft);
        if (!draft.success || typeof value?.ownerId !== 'string') return current;
        return { ...current, ownerId: value.ownerId, draft: draft.data };
      },
    },
  ),
);
