/**
 * Keeps the session store in step with Supabase Auth, the server's age record and the preferences
 * store, and runs the side effects of signing in and out. Mounted once by the root layout.
 *
 * Launch: the stored session and this device's hints (birth year, AI consent) decide the first
 * screen without waiting for the network; the server's age record then replaces the hint.
 * Onboarding completion always comes from the preferences store.
 */
import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { readPublicEnv } from '@/lib/env';
import { describeError, logger } from '@/lib/logger';
import { queryClient } from '@/lib/query/client';
import { getSupabase } from '@/lib/supabase/client';

import { fetchAccountStatus, isAccountError } from './accountApi';
import { signOut } from './authActions';
import { clearUserData, preferences, sync } from './deps';
import { readCachedSetup, writeCachedSetup } from './profileCache';
import { ageBandFor, useSessionStore, type SessionState } from './sessionStore';

const RESTORE_TIMEOUT_MS = 8000;

/** Person whose server age record still needs to be fetched (a launch offline, a failed call). */
let ageCheckPending: string | null = null;
/** Person whose data sync is running. */
let syncingFor: string | null = null;

function stopSyncing(): void {
  if (syncingFor == null) return;
  sync.stop();
  syncingFor = null;
}

/** Drops everything the previous person left on this device. */
function clearDeviceData(): void {
  stopSyncing();
  clearUserData();
  queryClient.clear();
  ageCheckPending = null;
}

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
    if (isAccountError(error) && error.kind === 'signed_out') {
      ageCheckPending = null;
      logger.info('Server no longer accepts this session; signing out');
      await signOut();
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

  const hint = readCachedSetup(userId);
  store.signedIn({
    userId,
    birthYear: hint.birthYear,
    onboardingComplete: preferences.isOnboardingComplete(),
    aiConsent: hint.aiConsent,
  });
  void refreshServerAge(userId);
}

/** Starts sync once a signed-in person has cleared the age gate, so their synced data arrives. */
function followSync(state: SessionState): void {
  const band = ageBandFor(state.birthYear);
  const eligible = state.userId != null && (band === 'teen' || band === 'adult');
  if (!eligible) {
    stopSyncing();
    return;
  }
  if (syncingFor === state.userId) return;
  stopSyncing();
  syncingFor = state.userId;
  sync.start(state.userId as string);
}

function rememberHints(state: SessionState, previous: SessionState): void {
  if (!state.userId) return;
  if (state.birthYear !== previous.birthYear || state.aiConsent !== previous.aiConsent) {
    writeCachedSetup(state.userId, { birthYear: state.birthYear, aiConsent: state.aiConsent });
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
      rememberHints(state, previous);
      followSync(state);
    });

    const unsubscribePreferences = preferences.subscribeOnboardingComplete((complete) => {
      if (complete) useSessionStore.getState().completeOnboarding();
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
      unsubscribePreferences();
      appState.remove();
    };
  }, []);
}
