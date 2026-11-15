import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/lib/haptics';
import {
  GlassIconButton,
  HEADER_TOP_OFFSET,
  PressableScale,
  radii,
  space,
  Text,
  useTheme,
} from '@/ui';

import { camera } from './cameraTheme';
import { FLASH, nextFlash, type SnapFlash } from './CaptureControls';
import { useFilmingTime } from '../hooks/useSweepClock';

export interface SweepOverlayProps {
  filming: boolean;
  /** Height of the camera area the overlay sits on. */
  cameraHeight: number;
  filmedMs: number;
  filmingSince: number | null;
  /** Null hides the flash control (front camera). */
  flash: SnapFlash | null;
  onFlash: (flash: SnapFlash) => void;
  onClose: () => void;
  onStop: () => void;
}

const STOP = 64;

/**
 * What sits on the camera during a sweep: the close circle, a recording chip with the time (or
 * "Paused"), the flash, and the stop button at the foot of the picture while filming.
 */
export function SweepOverlay({
  filming,
  cameraHeight,
  filmedMs,
  filmingSince,
  flash,
  onFlash,
  onClose,
  onStop,
}: SweepOverlayProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const elapsed = useFilmingTime(filmedMs, filmingSince);
  const flashInfo = flash ? FLASH[flash] : null;
  return (
    <>
      <View pointerEvents="box-none" style={[styles.top, { top: insets.top + HEADER_TOP_OFFSET }]}>
        <GlassIconButton
          icon="xmark"
          accessibilityLabel="Discard this sweep"
          accessibilityHint="Goes back to the camera without keeping the list"
          onPress={onClose}
          scheme="dark"
          iconColor="onImage"
          testID="sweep-close"
        />
        <View
          style={styles.chip}
          accessible
          accessibilityLabel={filming ? `Filming, ${elapsed}` : 'Paused'}
          accessibilityLiveRegion="polite"
        >
          {filming ? <View style={[styles.dot, { backgroundColor: theme.colors.danger }]} /> : null}
          <Text variant="label" style={styles.ink} accessible={false} testID="sweep-chip">
            {filming ? elapsed : 'Paused'}
          </Text>
        </View>
        {filming && flash && flashInfo ? (
          <GlassIconButton
            icon={flashInfo.icon}
            accessibilityLabel={flashInfo.label}
            accessibilityHint="Switches between flash off, auto and on"
            onPress={() => {
              haptics.selection();
              onFlash(nextFlash(flash));
            }}
            scheme="dark"
            iconColor="onImage"
            selected={flash !== 'off'}
          />
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
      {filming ? (
        <View pointerEvents="box-none" style={[styles.stopRow, { top: cameraHeight - STOP - 40 }]}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Stop filming"
            accessibilityHint="Keeps the list so you can add what it missed"
            onPress={() => {
              haptics.impact('medium');
              onStop();
            }}
            style={styles.stop}
            testID="sweep-stop"
          >
            <View style={[styles.square, { backgroundColor: theme.colors.danger }]} />
          </PressableScale>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  top: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radii.pill,
    backgroundColor: camera.capsule,
    borderWidth: 0.5,
    borderColor: camera.hairline,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ink: { color: camera.ink },
  spacer: { width: 44 },
  stopRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  stop: {
    width: STOP,
    height: STOP,
    borderRadius: STOP / 2,
    borderWidth: 4,
    borderColor: camera.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  square: { width: 24, height: 24, borderRadius: 6 },
});
