/**
 * Reads the stored Supabase session at launch and keeps the session store in sync with auth
 * events. Mounted once by the root layout.
 */
import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';

import { readPublicEnv } from '@/lib/env';
import { describeError, logger } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase/client';

import { readCachedSetup, writeCachedSetup } from './profileCache';
import { useSessionStore } from './sessionStore';

const RESTORE_TIMEOUT_MS = 8000;

function applySession(session: Session | null): void {
  const store = useSessionStore.getState();
  if (!session) {
    if (store.status !== 'signedOut') store.signedOut();
    return;
  }
  const userId = session.user.id;
  if (store.userId === userId && store.status !== 'loading') return;
  store.signedIn({ userId, ...readCachedSetup(userId) });
}

export function useSessionBootstrap(): void {
  useEffect(() => {
    if (!readPublicEnv().ok) return undefined;
    const client = getSupabase();
    let active = true;

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
      if (active) applySession(session);
    });

    const unsubscribeStore = useSessionStore.subscribe((state, previous) => {
      if (!state.userId) return;
      if (
        state.birthYear !== previous.birthYear ||
        state.onboardingComplete !== previous.onboardingComplete ||
        state.aiConsent !== previous.aiConsent
      ) {
        writeCachedSetup(state.userId, {
          birthYear: state.birthYear,
          onboardingComplete: state.onboardingComplete,
          aiConsent: state.aiConsent,
        });
      }
    });

    return () => {
      active = false;
      clearTimeout(fallback);
      data.subscription.unsubscribe();
      unsubscribeStore();
    };
  }, []);
}
