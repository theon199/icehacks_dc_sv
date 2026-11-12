/**
 * Keeps the session store in step with Supabase Auth, the server's age record and the user stores,
 * and runs the side effects of signing in and out. Mounted once by the root layout.
 *
 * Launch: the stored session and this device's birth-year hint decide the first screen without
 * waiting for the network; the server's age record then replaces the hint. Onboarding completion
 * comes from the synced preferences document and AI consent from the settings store's launch hint.
 *
 * Local user data belongs to one account at a time. When a session ends, or another account takes
 * over, every user store is wiped through the sync session; when sync starts it also checks which
 * account the data on the device belongs to and wipes it if that is someone else.
 */
import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { readPublicEnv } from '@/lib/env';
import { describeError, logger } from '@/lib/logger';
import { queryClient } from '@/lib/query/client';
import { getSupabase } from '@/lib/supabase/client';

import { fetchAccountStatus, isAccountError } from './accountApi';
import { sessionRejectedByServer, signOut } from './authActions';
import { aiConsentHint, onboarding, signOutCleanup, startSync, stopSync } from './deps';
import { usePendingEmail } from './pendingEmail';
import { readCachedSetup, writeCachedSetup } from './profileCache';
import { ageBandFor, useSessionStore, type SessionState } from './sessionStore';

/**
 * Longest the splash waits for the stored session. Offline, restoring can stall on a token refresh;
 * if this fires first the welcome screen shows until the restore finishes, then the app corrects
 * itself, so the wait is generous rather than tight.
 */
const RESTORE_TIMEOUT_MS = 15000;

/** Person whose server age record still needs to be fetched (a launch offline, a failed call). */
let ageCheckPending: string | null = null;
/** Person whose data sync is running. */
let syncingFor: string | null = null;
/**
 * Wipe of the previous account's data that has not finished yet. Until it has, the stores still
 * hold that account's answers, so nothing is read from them for the person signing in.
 */
let pendingCleanup: Promise<void> | null = null;

function stopSyncing(): void {
  if (syncingFor == null) return;
  syncingFor = null;
  stopSync().catch((error: unknown) => logger.warn('Could not stop sync', describeError(error)));
}

/** Drops everything the previous person left on this device. */
function clearDeviceData(): void {
  syncingFor = null;
  const cleanup = signOutCleanup().catch((error: unknown) => {
    logger.error('Could not clear user data', describeError(error));
  });
  pendingCleanup = cleanup;
  void cleanup.then(() => {
    if (pendingCleanup === cleanup) pendingCleanup = null;
  });
  queryClient.clear();
  usePendingEmail.getState().clear();
  ageCheckPending = null;
}

const isCurrentUser = (userId: string) => useSessionStore.getState().userId === userId;

async function refreshServerAge(userId: string): Promise<void> {
  const before = useSessionStore.getState().birthYear;
  ageCheckPending = userId;
  try {
    const status = await fetchAccountStatus();
    if (ageCheckPending === userId) ageCheckPending = null;
    const state = useSessionStore.getState();
    // A birth year entered while this call was in flight is newer than its answer.
    if (state.userId !== userId || state.birthYear !== before) return;
    state.applyServerAge({ userId, hasBirthYear: status.hasBirthYear, ageYears: status.ageYears });
  } catch (error) {
    // A reply about someone who has since signed out or switched accounts says nothing about now.
    if (!isCurrentUser(userId)) return;
    if (isAccountError(error) && error.kind === 'signed_out') {
      // One refused call can be a blip; only sign out (and wipe local data) once auth confirms it.
      if ((await sessionRejectedByServer()) && isCurrentUser(userId)) {
        ageCheckPending = null;
        logger.info('Server no longer accepts this session; signing out');
        await signOut();
      }
      return;
    }
    logger.info('Could not read the account age record yet', describeError(error));
  }
}

function applySession(session: Session | null): void {
  const store = useSessionStore.getState();
  if (!session) {
    if (store.userId) clearDeviceData();
    if (store.status !== 'signedOut') store.signedOut();
    return;
  }
  const userId = session.user.id;
  if (store.userId === userId && store.status !== 'loading') return;
  if (store.userId && store.userId !== userId) clearDeviceData();
  usePendingEmail.getState().clear();

  const cleanup = pendingCleanup;
  store.signedIn({
    userId,
    birthYear: readCachedSetup(userId).birthYear,
    onboardingComplete: cleanup == null && onboarding.isComplete(),
    aiConsent: cleanup == null && aiConsentHint.read(),
  });
  if (cleanup) void cleanup.then(() => applyLocalAnswers(userId));
  void refreshServerAge(userId);
}

/**
 * Re-reads onboarding completion and the AI consent hint once the stores are known to hold this
 * person's data: after a wipe of the previous account, and after sync has checked the owner.
 */
function applyLocalAnswers(userId: string): void {
  if (!isCurrentUser(userId) || pendingCleanup != null) return;
  const session = useSessionStore.getState();
  session.setOnboardingComplete(onboarding.isComplete());
  const granted = aiConsentHint.read();
  if (session.aiConsent !== granted) session.setAiConsent(granted);
}

/** Starts sync once a signed-in person has cleared the age gate, so their synced data arrives. */
function followSync(state: SessionState): void {
  const { userId } = state;
  const band = ageBandFor(state.birthYear);
  if (userId == null || (band !== 'teen' && band !== 'adult')) {
    stopSyncing();
    return;
  }
  if (syncingFor === userId) return;
  syncingFor = userId;
  // Starting checks which account the local data belongs to and wipes it if it is someone else's.
  startSync(userId)
    .then(() => applyLocalAnswers(userId))
    .catch((error: unknown) => logger.error('Could not start sync', describeError(error)));
}

/** Keeps the settings store's launch hint in step with the signed-in person's answer. */
function mirrorAiConsent(state: SessionState, previous: SessionState): void {
  if (
    state.userId != null &&
    state.userId === previous.userId &&
    state.aiConsent !== previous.aiConsent &&
    pendingCleanup == null
  ) {
    aiConsentHint.remember(state.aiConsent);
  }
}

function rememberBirthYear(state: SessionState, previous: SessionState): void {
  if (state.userId && state.birthYear !== previous.birthYear) {
    writeCachedSetup(state.userId, { birthYear: state.birthYear });
  }
}

export function useSessionBootstrap(): void {
  useEffect(() => {
    if (!readPublicEnv().ok) return undefined;
    const client = getSupabase();
    let active = true;
    // Start from a clean slate if the root remounts (development reloads).
    stopSyncing();
    ageCheckPending = null;

    client.auth
      .getSession()
      .then(({ data }) => {
        if (active) applySession(data.session);
      })
      .catch((error: unknown) => {
        logger.warn('Could not restore session', describeError(error));
        if (active) applySession(null);
      });

    // Restoring can wait on a token refresh; never hold the splash screen forever offline.
    const fallback = setTimeout(() => {
      if (active && useSessionStore.getState().status === 'loading') {
        logger.warn('Session restore timed out');
        applySession(null);
      }
    }, RESTORE_TIMEOUT_MS);

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      // Synchronous on purpose: awaiting another auth call inside this callback can deadlock, so
      // the follow-up server check is started without being awaited.
      if (active) applySession(session);
    });

    const unsubscribeStore = useSessionStore.subscribe((state, previous) => {
      rememberBirthYear(state, previous);
      mirrorAiConsent(state, previous);
      followSync(state);
    });

    // Finishing onboarding here, or a returning person's answers arriving through sync. A wipe
    // (completion going back to false) is followed up by `applyLocalAnswers` instead.
    const unsubscribeOnboarding = onboarding.subscribe((complete) => {
      if (complete && pendingCleanup == null) useSessionStore.getState().completeOnboarding();
    });

    const appState = AppState.addEventListener('change', (next) => {
      const userId = useSessionStore.getState().userId;
      if (next === 'active' && userId && ageCheckPending === userId) {
        void refreshServerAge(userId);
      }
    });

    return () => {
      active = false;
      clearTimeout(fallback);
      data.subscription.unsubscribe();
      unsubscribeStore();
      unsubscribeOnboarding();
      appState.remove();
    };
  }, []);
}
