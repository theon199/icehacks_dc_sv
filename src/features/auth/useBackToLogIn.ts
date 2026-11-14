import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { accountSheetHref } from './accountSheetState';

/**
 * Returns to the welcome screen with the log-in form open. Pages pushed over the welcome screen are
 * closed on the way, so the account sheet is found where it was rather than stacked twice.
 */
export function useBackToLogIn(): () => void {
  const router = useRouter();
  return useCallback(() => {
    router.dismissTo(accountSheetHref({ intent: 'log-in', step: 'email' }));
  }, [router]);
}
