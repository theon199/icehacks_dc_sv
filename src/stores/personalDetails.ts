/**
 * Optional body details used for nutrient targets. Sensitive, so they are persisted in the
 * Keychain rather than the app's plain key/value store, and loaded asynchronously at launch.
 */
import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { singletonRecord } from './memo';
import { securePersistStorage, versionedPersist, waitForHydration } from './persistence';
import { createCollectionAdapter } from './syncAdapter';

export const SEXES = ['female', 'male', 'unspecified'] as const;
export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export type Sex = (typeof SEXES)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const personalDetailsSchema = z.object({
  heightCm: z.number().min(50).max(272).nullable(),
  weightKg: z.number().min(20).max(400).nullable(),
  sex: z.enum(SEXES).nullable(),
  activity: z.enum(ACTIVITY_LEVELS).nullable(),
});
export type PersonalDetails = z.infer<typeof personalDetailsSchema>;

export const emptyPersonalDetails: PersonalDetails = {
  heightCm: null,
  weightKg: null,
  sex: null,
  activity: null,
};

/** Applies a partial update; invalid values leave the details unchanged. */
export function updatePersonalDetails(
  details: PersonalDetails,
  patch: Partial<PersonalDetails>,
): PersonalDetails {
  const parsed = personalDetailsSchema.safeParse({ ...details, ...patch });
  if (!parsed.success) return details;
  const next = parsed.data;
  const same = (Object.keys(next) as (keyof PersonalDetails)[]).every(
    (key) => next[key] === details[key],
  );
  return same ? details : next;
}

export interface PersonalDetailsState {
  details: PersonalDetails;
  update: (patch: Partial<PersonalDetails>) => void;
  clear: () => void;
  reset: () => void;
}

export const usePersonalDetailsStore = create<PersonalDetailsState>()(
  persist(
    (set, get) => ({
      details: emptyPersonalDetails,
      update: (patch) => {
        const next = updatePersonalDetails(get().details, patch);
        if (next !== get().details) set({ details: next });
      },
      clear: () => set({ details: emptyPersonalDetails }),
      reset: () => set({ details: emptyPersonalDetails }),
    }),
    versionedPersist({
      name: 'user.personal_details',
      version: 1,
      schema: z.object({ details: personalDetailsSchema }),
      partialize: (state: PersonalDetailsState) => ({ details: state.details }),
      storage: securePersistStorage<{ details: PersonalDetails }>(),
    }),
  ),
);

function subscribeHydration(listener: () => void): () => void {
  return usePersonalDetailsStore.persist.onFinishHydration(listener);
}

/** False until the Keychain copy has been read; show a placeholder instead of empty fields. */
export function usePersonalDetailsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeHydration,
    () => usePersonalDetailsStore.persist.hasHydrated(),
    () => false,
  );
}

export const selectPersonalDetails = (state: PersonalDetailsState) => state.details;
export const selectHasPersonalDetails = (state: PersonalDetailsState) =>
  Object.values(state.details).some((value) => value != null);

const asDocs = singletonRecord<PersonalDetails>('main');

export const personalDetailsSync = createCollectionAdapter({
  collection: 'personal_details',
  store: usePersonalDetailsStore,
  select: (state) => asDocs(state.details),
  schema: personalDetailsSchema,
  // Never sync before the Keychain copy is loaded: empty defaults would overwrite the real values.
  ready: () => waitForHydration(usePersonalDetailsStore),
  apply: (state, { upserts }) => ({ details: upserts.main ?? state.details }),
});
