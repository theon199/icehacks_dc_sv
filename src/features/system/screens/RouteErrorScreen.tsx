import { useEffect } from 'react';

import { describeError, logger } from '@/lib/logger';
import { ErrorState, Screen } from '@/ui';

export interface RouteErrorScreenProps {
  error: Error;
  retry: () => Promise<void>;
}

/** Fallback rendered by expo-router when a screen throws while rendering. */
export function RouteErrorScreen({ error, retry }: RouteErrorScreenProps) {
  useEffect(() => {
    logger.error('Screen crashed', describeError(error));
  }, [error]);

  return (
    <Screen safeTop testID="route-error">
      <ErrorState
        error={error}
        title="This screen hit a problem"
        message="Something unexpected happened. Trying again usually fixes it."
        onRetry={() => {
          void retry();
        }}
      />
    </Screen>
  );
}
