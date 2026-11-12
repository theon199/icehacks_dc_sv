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

import {
  dayTiltFor,
  dayTiltNote,
  toRankFeedback,
  toRankPreferences,
  useDayHints,
  withDayTilt,
} from './deps';
import { useIdentityVersion } from './useIdentityVersion';
import { useLocalHour } from './useLocalHour';

export interface DeckInputs {
  /** Preferences for ranking, with today's day-context tilt folded in. */
  readonly prefs: UserPreferences;
  /** Safety rules for the person's own answers (never tilted). */
  readonly safety: SafetyRules;
  readonly feedback: readonly FeedbackEvent[];
  readonly pantry: ReadonlySet<string>;
  readonly smallAppetite: boolean;
  readonly dayNote: string | null;
  /** Changes whenever the person's own preferences or pantry change (starts a fresh deck). */
  readonly version: string;
  /**
   * Names today's tilt. It only steers the next fill: cards already queued stay put, so a tilt
   * that flips mid-session (the hour reaching dinner, say) never yanks the deck away.
   */
  readonly tilt: string;
  /** Moves with every change to the feedback history (including past the store's size cap). */
  readonly feedbackVersion: number;
}

export function useDeckInputs(clock?: () => number): DeckInputs {
  const stored = usePreferencesStore((state) => state.prefs);
  const units = useSettingsStore(selectUnits);
  const events = useFeedbackStore(selectFeedbackEvents);
  const pantry = usePantryStore(selectPantryIngredientIds);
  const hour = useLocalHour(clock);
  // Health may hand over a new but equal hints object (its clock moves on every foreground), so
  // everything below follows the two flags, never the object: an unchanged tilt keeps the deck.
  const { protein, lighter } = dayTiltFor(useDayHints(), hour);

  const base = useMemo(() => toRankPreferences(stored, units), [stored, units]);
  const prefs = useMemo(() => withDayTilt(base, { protein, lighter }), [base, protein, lighter]);
  const safety = useMemo(() => compileSafetyRules(base), [base]);
  const feedback = useMemo(() => toRankFeedback(events), [events]);
  const dayNote = dayTiltNote({ protein, lighter });

  const prefsVersion = useIdentityVersion(base);
  const pantryVersion = useIdentityVersion(pantry);
  const feedbackVersion = useIdentityVersion(events);

  return {
    prefs,
    safety,
    feedback,
    pantry,
    smallAppetite: stored.smallAppetite,
    dayNote,
    version: `p${prefsVersion}.k${pantryVersion}`,
    tilt: `${protein ? 'P' : '-'}${lighter ? 'L' : '-'}`,
    feedbackVersion,
  };
}
