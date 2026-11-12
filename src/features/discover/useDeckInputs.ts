/**
 * The person-specific inputs to ranking, read from the stores with narrow selectors and reshaped
 * once per change. Each input also gets a version number that moves only when its source object
 * changes, so callers can build a cheap cache key instead of comparing contents.
 */
import { useMemo } from 'react';

import {
  compileSafetyRules,
  type FeedbackEvent,
  type SafetyRules,
  type UserPreferences,
} from '@/domain';
import {
  selectFeedbackEvents,
  selectPantryIngredientIds,
  selectUnits,
  useFeedbackStore,
  usePantryStore,
  usePreferencesStore,
  useSettingsStore,
} from '@/stores';

import { dayHintNote, toRankFeedback, toRankPreferences, useDayHints, withDayHints } from './deps';
import { useIdentityVersion } from './useIdentityVersion';

export interface DeckInputs {
  /** Preferences for ranking, with today's day-context tilt folded in. */
  readonly prefs: UserPreferences;
  /** Safety rules for the person's own answers (never tilted). */
  readonly safety: SafetyRules;
  readonly feedback: readonly FeedbackEvent[];
  readonly pantry: ReadonlySet<string>;
  readonly smallAppetite: boolean;
  readonly dayNote: string | null;
  /** Changes whenever preferences, day hints or pantry change. */
  readonly version: string;
  readonly feedbackCount: number;
}

export function useDeckInputs(hour: number): DeckInputs {
  const stored = usePreferencesStore((state) => state.prefs);
  const units = useSettingsStore(selectUnits);
  const events = useFeedbackStore(selectFeedbackEvents);
  const pantry = usePantryStore(selectPantryIngredientIds);
  const hints = useDayHints();

  const base = useMemo(() => toRankPreferences(stored, units), [stored, units]);
  const prefs = useMemo(() => withDayHints(base, hints, hour), [base, hints, hour]);
  const safety = useMemo(() => compileSafetyRules(base), [base]);
  const feedback = useMemo(() => toRankFeedback(events), [events]);
  const dayNote = useMemo(() => dayHintNote(hints, hour), [hints, hour]);

  const prefsVersion = useIdentityVersion(prefs);
  const pantryVersion = useIdentityVersion(pantry);

  return {
    prefs,
    safety,
    feedback,
    pantry,
    smallAppetite: stored.smallAppetite,
    dayNote,
    version: `p${prefsVersion}.k${pantryVersion}`,
    feedbackCount: events.length,
  };
}
