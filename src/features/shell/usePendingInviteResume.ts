/**
 * Opens an invite link that was parked while the person was signed out or in setup, once the
 * signed-in app is available. Checked again for every account that signs in on this device.
 */
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';

import { savePendingInvite, takePendingInvite } from './pendingInvite';

export function usePendingInviteResume(): void {
  const userId = useSessionStore((s) => (s.status === 'ready' ? s.userId : null));
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;
    takePendingInvite()
      .then(async (code) => {
        if (!code) return;
        const session = useSessionStore.getState();
        if (session.status !== 'ready' || session.userId !== userId) {
          // The session ended while storage was being read: keep the invite for the next one.
          await savePendingInvite(code);
          return;
        }
        router.push({ pathname: '/invite/[code]', params: { code } });
      })
      .catch((error: unknown) =>
        logger.warn('Could not open the saved invite link', describeError(error)),
      );
  }, [router, userId]);
}
