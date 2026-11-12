import { router } from 'expo-router';

import { EmptyState, Screen } from '@/ui';

/** Shown for links that do not match any screen. */
export function NotFoundScreen() {
  return (
    <Screen safeTop testID="not-found">
      <EmptyState
        icon="questionmark.folder"
        title="We couldn't find that page"
        message="The link may be out of date, or the content was removed."
        actionLabel="Go to Famara"
        onAction={() => router.replace('/')}
      />
    </Screen>
  );
}
