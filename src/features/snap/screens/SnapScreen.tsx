import { ComingSoon } from '@/ui';

/**
 * Placeholder until the snap feature ships.
 *
 * Snap is a tab root, and tabs cannot sit inside `Stack.Protected`, so this screen must render its
 * own gate: check `selectCanUseAi` from `@/features/auth` and send people to `ai-consent` (or explain
 * the 18+ limit) before opening the camera. The result routes (`snap/dish`, `snap/pantry`) are
 * already guarded by the `(app)` layout.
 */
export function SnapScreen() {
  return (
    <ComingSoon
      title="Snap"
      description="Photograph your pantry or a dish."
      icon="camera"
      safeTop
    />
  );
}
