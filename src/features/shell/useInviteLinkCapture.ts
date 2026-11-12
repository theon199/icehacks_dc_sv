/**
 * Parks invite links that arrive while the signed-in app is not available (signed out or in
 * setup), so the root guards do not lose them. Once the session is ready, `SignedInEffects` opens
 * the parked invite.
 *
 * Every link opening is handled as its own event: the link that launched the app, then each link
 * the OS hands over while it runs. Tapping the same invite again (say, after signing out) is a new
 * event and is parked again, while a link the router already opened is never parked later just
 * because the session changed.
 */
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';

import type { SessionStatus } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';

import { inviteCodeFromUrl, savePendingInvite } from './pendingInvite';

function park(url: string): void {
  const code = inviteCodeFromUrl(url);
  if (!code) return;
  savePendingInvite(code).catch((error: unknown) =>
    logger.warn('Could not keep the invite link for later', describeError(error)),
  );
}

export function useInviteLinkCapture(status: SessionStatus): void {
  const statusRef = useRef(status);
  // A link that arrived while the stored session was still being read. It may yet open normally,
  // so it waits for the status to settle. This is defensive: the root layout renders
  // `RootNavigator` only after the stored session has been read, so today the hook never sees
  // `loading`. It keeps links safe if the navigator is ever mounted earlier.
  const waiting = useRef<string | null>(null);

  useEffect(() => {
    statusRef.current = status;
    if (status === 'loading') return;
    const url = waiting.current;
    waiting.current = null;
    if (url && status !== 'ready') park(url);
  }, [status]);

  useEffect(() => {
    let active = true;
    const opened = (url: string | null) => {
      if (!active || !url) return;
      const current = statusRef.current;
      // Defensive, see `waiting`: unreachable while the navigator mounts after the session read.
      if (current === 'loading') waiting.current = url;
      else if (current !== 'ready') park(url);
    };
    Linking.getInitialURL()
      .then(opened)
      .catch((error: unknown) =>
        logger.warn('Could not read the link that opened Famara', describeError(error)),
      );
    const subscription = Linking.addEventListener('url', (event) => opened(event.url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
}
