/** The person's appearance choice (Settings → Appearance), persisted on device. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '@/lib/storage/kv';

export type AppearancePreference = 'system' | 'light' | 'dark';

interface AppearanceState {
  preference: AppearancePreference;
  setPreference: (preference: AppearancePreference) => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      preference: 'system',
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: 'ui.appearance',
      version: 1,
      storage: persistStorage<Pick<AppearanceState, 'preference'>>(),
      partialize: (state) => ({ preference: state.preference }),
      merge: (persisted, current) => {
        const value = (persisted as Partial<AppearanceState> | undefined)?.preference;
        return value === 'light' || value === 'dark' || value === 'system'
          ? { ...current, preference: value }
          : current;
      },
    },
  ),
);
