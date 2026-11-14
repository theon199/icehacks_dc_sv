import { router } from 'expo-router';

import { snapCameraHref } from '../links';
import { PhotoBackdrop } from './PhotoBackdrop';
import { SnapPill } from './SnapPill';
import { StatusCard } from './StatusCard';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * Shown when a result screen opens without a snap to show, e.g. from an old link or after the app
 * restarted (snap results are kept in memory only).
 */
export function NoSnapResult({ mode }: { mode: 'pantry' | 'dish' }) {
  return (
    <PhotoBackdrop photoUri={null} onClose={back} testID="snap-no-result">
      <StatusCard
        title={mode === 'pantry' ? 'No pantry photo yet' : 'No dish photo yet'}
        message="Snap results are kept until you take another photo or close Famara."
        actions={
          <SnapPill
            label="Open Snap"
            tone="lime"
            // Straight to the camera in the right mode: going back could return to the screen
            // that opened this one and loop.
            onPress={() => router.replace(snapCameraHref({ mode }))}
          />
        }
      />
    </PhotoBackdrop>
  );
}
