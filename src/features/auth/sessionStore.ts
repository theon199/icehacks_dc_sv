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
  /** Whether the person has agreed to the AI terms. Treated as false when absent. */
  aiConsent?: boolean;
}

export interface SessionState {
  status: SessionStatus;
  userId: string | null;
  birthYear: number | null;
  onboardingComplete: boolean;
  /** Agreement to the AI terms. AI routes also need age 18+; see `selectCanUseAi`. */
  aiConsent: boolean;
  /** A signed-in profile was loaded or changed. */
  signedIn: (profile: SignedInProfile) => void;
  setBirthYear: (birthYear: number) => void;
  completeOnboarding: () => void;
  /** Records the answer from the AI consent screen (or a later withdrawal). */
  setAiConsent: (granted: boolean) => void;
  signedOut: () => void;
}

/**
 * Pure status derivation, kept separate so it is trivial to test.
 *
 * Someone below the minimum age never reaches the app, even if a stale cache or a server bug says
 * onboarding is complete: they stay in (setup), whose age gate explains why and offers deletion.
 */
export function resolveStatus(
  profile: SignedInProfile | null,
  now: Date = new Date(),
): SessionStatus {
  if (!profile) return 'signedOut';
  if (profile.birthYear == null || !profile.onboardingComplete) return 'needsSetup';
  if (ageFromBirthYear(profile.birthYear, now) < MIN_AGE) return 'needsSetup';
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
  aiConsent: false,
};

export const useSessionStore = create<SessionState>()((set, get) => ({
  status: 'loading',
  userId: null,
  birthYear: null,
  onboardingComplete: false,
  aiConsent: false,

  signedIn: (profile) =>
    set({
      status: resolveStatus(profile),
      userId: profile.userId,
      birthYear: profile.birthYear,
      onboardingComplete: profile.onboardingComplete,
      aiConsent: profile.aiConsent ?? false,
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

  setAiConsent: (granted) => {
    if (!get().userId) return;
    set({ aiConsent: granted });
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

/**
 * Whether AI features (Chef, makeover, Snap results) are open to the signed-in person: they must be
 * 18+ and have agreed to the AI terms. Drives the `Stack.Protected` guard around AI routes.
 */
export function selectCanUseAi(
  state: Pick<SessionState, 'birthYear' | 'aiConsent'>,
  now?: Date,
): boolean {
  return state.aiConsent && selectIsAdult(state, now);
}
