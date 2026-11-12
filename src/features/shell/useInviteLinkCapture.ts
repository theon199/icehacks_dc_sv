/**
 * Parks invite links that arrive while the signed-in app is not available (signed out or in
 * setup), so the root guards do not lose them. Once the session is ready, `SignedInEffects` opens
 * the parked invite.
 */
import { useURL } from 'expo-linking';
import { useEffect, useRef } from 'react';

import type { SessionStatus } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';

import { inviteCodeFromUrl, savePendingInvite } from './pendingInvite';

export function useInviteLinkCapture(status: SessionStatus): void {
  const url = useURL();
  // The last link looked at. `useURL` keeps returning the same link after it has been handled, so
  // without this a later sign-out would park an invite the router already opened.
  const seen = useRef<string | null>(null);

  useEffect(() => {
    // While the stored session is still being read, wait: the link may yet open normally.
    if (!url || status === 'loading' || url === seen.current) return;
    seen.current = url;
    if (status === 'ready') return;
    const code = inviteCodeFromUrl(url);
    if (!code) return;
    savePendingInvite(code).catch((error: unknown) =>
      logger.warn('Could not keep the invite link for later', describeError(error)),
    );
  }, [status, url]);
}
