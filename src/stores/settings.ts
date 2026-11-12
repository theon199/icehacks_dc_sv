/**
 * App settings. Units, appearance and notification choices sync as one document.
 *
 * AI consent is different: the account on the server is its source of truth. This store only
 * remembers the last known answer as a launch hint so the right screen shows before the network
 * answers; it is never synced from here and must be overwritten with the server's answer.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { singletonRecord } from './memo';
import { versionedPersist } from './persistence';
import { createCollectionAdapter } from './syncAdapter';

export const settingsSchema = z.object({
  units: z.enum(['us', 'metric']),
  appearance: z.enum(['system', 'light', 'dark']),
  notifications: z.object({
    social: z.boolean(),
    cookTimers: z.boolean(),
    planReminders: z.boolean(),
  }),
});
export type Settings = z.infer<typeof settingsSchema>;
export type Units = Settings['units'];
export type Appearance = Settings['appearance'];
export type NotificationSettings = Settings['notifications'];

export const defaultSettings: Settings = {
  units: 'us',
  appearance: 'system',
  notifications: { social: false, cookTimers: true, planReminders: false },
};

const aiConsentHintSchema = z.object({ granted: z.boolean(), at: z.string() }).nullable();
export type AiConsentHint = z.infer<typeof aiConsentHintSchema>;

export function updateSettings(
  settings: Settings,
  patch: Partial<Omit<Settings, 'notifications'>> & {
    notifications?: Partial<NotificationSettings>;
  },
): Settings {
  const parsed = settingsSchema.safeParse({
    ...settings,
    ...patch,
    notifications: { ...settings.notifications, ...patch.notifications },
  });
  if (!parsed.success) return settings;
  const next = parsed.data;
  const same =
    next.units === settings.units &&
    next.appearance === settings.appearance &&
    (Object.keys(next.notifications) as (keyof NotificationSettings)[]).every(
      (key) => next.notifications[key] === settings.notifications[key],
    );
  return same ? settings : next;
}

export interface SettingsState {
  settings: Settings;
  /** Last known AI consent answer, as a hint only (see the file comment). */
  aiConsentHint: AiConsentHint;
  setUnits: (units: Units) => void;
  setAppearance: (appearance: Appearance) => void;
  setNotifications: (patch: Partial<NotificationSettings>) => void;
  /** Records the server's answer (or the one just sent to it). */
  rememberAiConsent: (granted: boolean, at?: string) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => {
      const commit = (next: Settings) => {
        if (next !== get().settings) set({ settings: next });
      };
      return {
        settings: defaultSettings,
        aiConsentHint: null,
        setUnits: (units) => commit(updateSettings(get().settings, { units })),
        setAppearance: (appearance) => commit(updateSettings(get().settings, { appearance })),
        setNotifications: (patch) =>
          commit(updateSettings(get().settings, { notifications: patch })),
        rememberAiConsent: (granted, at = new Date().toISOString()) => {
          if (get().aiConsentHint?.granted !== granted) set({ aiConsentHint: { granted, at } });
        },
        reset: () => set({ settings: defaultSettings, aiConsentHint: null }),
      };
    },
    versionedPersist({
      name: 'user.settings',
      version: 1,
      schema: z.object({ settings: settingsSchema, aiConsentHint: aiConsentHintSchema }),
      partialize: (state) => ({ settings: state.settings, aiConsentHint: state.aiConsentHint }),
    }),
  ),
);

export const selectSettings = (state: SettingsState) => state.settings;
export const selectUnits = (state: SettingsState) => state.settings.units;
export const selectAppearance = (state: SettingsState) => state.settings.appearance;
export const selectNotificationSettings = (state: SettingsState) => state.settings.notifications;
export const selectAiConsentHint = (state: SettingsState) => state.aiConsentHint;

const asDocs = singletonRecord<Settings>('main');

export const settingsSync = createCollectionAdapter({
  collection: 'settings',
  store: useSettingsStore,
  select: (state) => asDocs(state.settings),
  schema: settingsSchema,
  apply: (state, { upserts }) => ({ settings: upserts.main ?? state.settings }),
});
