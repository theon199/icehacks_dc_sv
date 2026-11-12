import { AiGate } from '../deps';
import { SnapCameraScreen } from './SnapCameraScreen';

/**
 * The Snap tab. Tabs cannot sit inside the `Stack.Protected` guard that covers AI routes, so the
 * tab gates itself: the camera only mounts for people who are 18+ and have agreed to AI use.
 */
export function SnapScreen() {
  return (
    <AiGate feature="Snap">
      <SnapCameraScreen />
    </AiGate>
  );
}
