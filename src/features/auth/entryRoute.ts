/**
 * The first screen the route guards allow for a session, for screens that sit outside the guarded
 * groups (auth links, the password reset, about pages, not found) and need to hand over.
 *
 * expo-router silently drops a navigation to a route whose `Stack.Protected` guard is closed, and
 * `/` exists only in the signed-in app. Sending someone who is signed out or still in setup to `/`
 * would leave them where they are, so these screens go to the screen their status allows instead.
 */
import type { Href } from 'expo-router';

import { ageBandFor, useSessionStore, type AgeBand, type SessionState } from './sessionStore';

/** The one (setup) screen available at a time; see `src/app/(setup)/_layout.tsx`. */
export type SetupStep = 'birth-year' | 'not-eligible' | 'onboarding';

/** Which setup screen a birth year leaves open: none yet, ruled out, or cleared to continue. */
export function setupStepFor(band: AgeBand): SetupStep {
  switch (band) {
    case 'unknown':
      return 'birth-year';
    case 'underMinimum':
    case 'notYetEligible':
      return 'not-eligible';
    case 'teen':
    case 'adult':
      return 'onboarding';
  }
}

const setupHrefs: Record<SetupStep, Href> = {
  'birth-year': '/birth-year',
  'not-eligible': '/not-eligible',
  onboarding: '/onboarding',
};

/**
 * Where a person with this session lands: the welcome flow, the setup screen their birth year
 * allows, or home. Null while the stored session is still being read, when no screen is open yet.
 */
export function entryHref(
  state: Pick<SessionState, 'status' | 'birthYear'>,
  now?: Date,
): Href | null {
  switch (state.status) {
    case 'loading':
      return null;
    case 'signedOut':
      return '/welcome';
    case 'needsSetup':
      return setupHrefs[setupStepFor(ageBandFor(state.birthYear, now))];
    case 'ready':
      return '/';
  }
}

/** Replaces the current screen with the entry screen for the session as it is right now. */
export function replaceWithEntry(router: { replace: (href: Href) => void }): void {
  const href = entryHref(useSessionStore.getState());
  if (href != null) router.replace(href);
}
