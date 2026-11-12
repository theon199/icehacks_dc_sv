/**
 * Test preferences. Only imported by tests; never re-exported from a barrel.
 */
import { DEFAULT_PREFERENCES, type UserPreferences } from '../../types/preferences';

/** Defaults with both safety questions answered "none", so every recipe can be considered. */
export const ANSWERED_PREFERENCES: UserPreferences = Object.freeze({
  ...DEFAULT_PREFERENCES,
  allergens: [],
  diets: [],
});
