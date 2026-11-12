/**
 * Session state that drives the route guards in `src/app/_layout.tsx`.
 *
 *   loading     → splash stays up while the stored session is read
 *   signedOut   → (auth) screens
 *   needsSetup  → (setup): birth year gate and onboarding
 *   ready       → the app
 */
import { create } from 'zustand';

export type SessionStatus = 'loading' | 'signedOut' | 'needsSetup' | 'ready';

/** Minimum age to use Famara, and to use AI features. */
export const MIN_AGE = 13;
export const MIN_AI_AGE = 18;

export interface SignedInProfile {
  userId: string;
  /** Year of birth from the age gate; null until the person has answered it. */
  birthYear: number | null;
  onboardingComplete: boolean;
}

export interface SessionState {
  status: SessionStatus;
  userId: string | null;
  birthYear: number | null;
  onboardingComplete: boolean;
  /** A signed-in profile was loaded or changed. */
  signedIn: (profile: SignedInProfile) => void;
  setBirthYear: (birthYear: number) => void;
  completeOnboarding: () => void;
  signedOut: () => void;
}

/** Pure status derivation, kept separate so it is trivial to test. */
export function resolveStatus(profile: SignedInProfile | null): SessionStatus {
  if (!profile) return 'signedOut';
  if (profile.birthYear == null || !profile.onboardingComplete) return 'needsSetup';
  return 'ready';
}

/**
 * Age in whole years from a birth year. Without a birth date the age is ambiguous for part of the
 * year, so this returns the lower bound (the person may not have had their birthday yet).
 */
export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear - 1;
}

const signedOutState = {
  status: 'signedOut' as const,
  userId: null,
  birthYear: null,
  onboardingComplete: false,
};

export const useSessionStore = create<SessionState>()((set, get) => ({
  status: 'loading',
  userId: null,
  birthYear: null,
  onboardingComplete: false,

  signedIn: (profile) =>
    set({
      status: resolveStatus(profile),
      userId: profile.userId,
      birthYear: profile.birthYear,
      onboardingComplete: profile.onboardingComplete,
    }),

  setBirthYear: (birthYear) => {
    const { userId, onboardingComplete } = get();
    if (!userId) return;
    set({ birthYear, status: resolveStatus({ userId, birthYear, onboardingComplete }) });
  },

  completeOnboarding: () => {
    const { userId, birthYear } = get();
    if (!userId) return;
    set({
      onboardingComplete: true,
      status: resolveStatus({ userId, birthYear, onboardingComplete: true }),
    });
  },

  signedOut: () => set(signedOutState),
}));

/** Age lower bound of the signed-in person, or null when unknown. */
export function selectAge(state: Pick<SessionState, 'birthYear'>, now?: Date): number | null {
  return state.birthYear == null ? null : ageFromBirthYear(state.birthYear, now);
}

/** Whether the signed-in person is old enough for AI features (consent is checked separately). */
export function selectIsAdult(state: Pick<SessionState, 'birthYear'>, now?: Date): boolean {
  const age = selectAge(state, now);
  return age != null && age >= MIN_AI_AGE;
}
