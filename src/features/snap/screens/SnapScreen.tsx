import type { SnapMode } from '@/lib/api/ai';
import { Screen } from '@/ui';

import { AiGate, selectCanUseAi, useSessionStore } from '../deps';
import { SnapCameraScreen } from './SnapCameraScreen';

const PURPOSE =
  'Snap reads a photo of your fridge or your plate: it lists what you have to cook with, or estimates a dish and finds a healthier version among Famara recipes.';

/**
 * The Snap tab. Tabs cannot sit inside the `Stack.Protected` guard that covers AI routes, so the
 * tab gates itself: the camera only mounts for people who are 18+ and have agreed to AI use.
 */
export function SnapScreen({ mode }: { mode?: SnapMode | undefined } = {}) {
  const unlocked = useSessionStore((state) => selectCanUseAi(state));
  const gated = (
    <AiGate feature="Snap" purpose={PURPOSE} testID="snap-ai-gate">
      <SnapCameraScreen requestedMode={mode} />
    </AiGate>
  );
  // The camera runs edge to edge under the status bar. The shared gate has no top inset of its
  // own, so only the locked explanation gets one.
  if (unlocked) return gated;
  return (
    <Screen safeTop scroll={false} padded={false}>
      {gated}
    </Screen>
  );
}
