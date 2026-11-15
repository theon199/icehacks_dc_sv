import { CameraView } from 'expo-camera';
import { useSyncExternalStore, type RefObject } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Icon, Text, photoOverlay, radii, space, useTheme } from '@/ui';

import type { CoachCameraAccess } from '../hooks/useCoachCamera';
import { ringOnTile, type CoachFocus, type PhotoSize } from '../logic/coachStatus';

export const LIVE_TILE = { width: 112, height: 144 } as const;

const subscribe = (onChange: () => void) => {
  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
};
const isActive = () => AppState.currentState !== 'background';

export interface LiveTileProps {
  access: CoachCameraAccess;
  cameraRef: RefObject<CameraView | null>;
  onReady: () => void;
  onMountError: () => void;
  /** The spot the last answer is about, on the still it was taken from. */
  focus: { focus: CoachFocus; photo: PhotoSize } | null;
}

/**
 * The front camera's view of the counter, small enough to leave the step readable. The preview
 * is only shown: a still is taken when a question is asked, and nothing is recorded.
 */
export function LiveTile({ access, cameraRef, onReady, onMountError, focus }: LiveTileProps) {
  const theme = useTheme();
  const active = useSyncExternalStore(subscribe, isActive, isActive);
  const reduceMotion = useReducedMotion();

  if (access !== 'granted') {
    return (
      <View
        style={[styles.tile, styles.off, { backgroundColor: theme.colors.surfaceSunken }]}
        accessible
        accessibilityLabel="Camera off"
        testID="coach-camera-off"
      >
        <Icon name="eye.slash" size={22} color="textMuted" />
        <Text variant="caption" tone="muted" align="center">
          {access === 'unknown' ? 'Camera' : 'Camera off'}
        </Text>
      </View>
    );
  }

  const ring = focus ? ringOnTile(focus.focus, focus.photo, LIVE_TILE, true) : null;
  return (
    <View
      style={[styles.tile, { backgroundColor: theme.colors.primary }]}
      accessible
      accessibilityLabel={
        ring ? 'Live camera view, the spot the coach means is ringed' : 'Live camera view'
      }
      testID="coach-live-tile"
    >
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        active={active}
        animateShutter={false}
        onCameraReady={onReady}
        onMountError={onMountError}
      />
      <View style={[styles.live, { backgroundColor: photoOverlay.chip }]}>
        <View style={[styles.dot, { backgroundColor: theme.colors.danger }]} />
        <Text variant="caption" maxFontSizeMultiplier={1.2} style={{ color: photoOverlay.text }}>
          Live
        </Text>
      </View>
      {ring ? (
        <Animated.View
          {...(reduceMotion ? {} : { entering: FadeIn.duration(theme.motion.duration.base) })}
          pointerEvents="none"
          testID="coach-focus-ring"
          style={[
            styles.ring,
            {
              left: ring.left,
              top: ring.top,
              width: ring.size,
              height: ring.size,
              borderColor: theme.colors.highlight,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: LIVE_TILE.width,
    height: LIVE_TILE.height,
    borderRadius: radii.tile,
    overflow: 'hidden',
  },
  off: { alignItems: 'center', justifyContent: 'center', gap: space.xs, padding: space.sm },
  live: {
    position: 'absolute',
    left: space.sm,
    top: space.sm,
    height: 24,
    paddingHorizontal: space.sm,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  ring: { position: 'absolute', borderWidth: 3, borderRadius: radii.pill },
});
