import { router } from 'expo-router';

import { EmptyState, Screen } from '@/ui';

/**
 * Shown when a result screen opens without a snap to show, e.g. from an old link or after the app
 * restarted (snap results are kept in memory only).
 */
export function NoSnapResult({ mode }: { mode: 'pantry' | 'dish' }) {
  return (
    <Screen testID="snap-no-result">
      <EmptyState
        icon="camera.viewfinder"
        title={mode === 'pantry' ? 'No pantry photo yet' : 'No dish photo yet'}
        message="Snap results are kept until you take another photo or close Famara."
        actionLabel="Open Snap"
        onAction={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/snap');
        }}
      />
    </Screen>
  );
}
