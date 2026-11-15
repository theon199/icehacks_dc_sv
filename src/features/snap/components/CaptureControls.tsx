import type { FlashMode } from 'expo-camera';
import { StyleSheet, View } from 'react-native';

import { GlassIconButton, Icon, PressableScale, space, useTheme, type IconName } from '@/ui';

import { camera } from './cameraTheme';

export type SnapFlash = Extract<FlashMode, 'off' | 'auto' | 'on'>;

const FLASH_ORDER: readonly SnapFlash[] = ['off', 'auto', 'on'];

export const FLASH: Readonly<Record<SnapFlash, { icon: IconName; label: string }>> = {
  off: { icon: 'bolt.slash', label: 'Flash off' },
  auto: { icon: 'bolt.badge.automatic', label: 'Flash auto' },
  on: { icon: 'bolt.fill', label: 'Flash on' },
};

export function nextFlash(flash: SnapFlash): SnapFlash {
  return FLASH_ORDER[(FLASH_ORDER.indexOf(flash) + 1) % FLASH_ORDER.length] ?? 'off';
}

export interface CaptureControlsProps {
  onShutter: () => void;
  onPickPhoto: () => void;
  /** Switch between the back and front cameras; omitted while there is no live camera. */
  onFlip?: (() => void) | undefined;
  /** The camera is ready and nothing is in progress. */
  canShoot: boolean;
  busy: boolean;
}

const SHUTTER = 76;
/** Size of the controls either side of the shutter. */
const SIDE = 52;

/** The library square, the white shutter ring and the flip circle along the bottom. */
export function CaptureControls({
  onShutter,
  onPickPhoto,
  onFlip,
  canShoot,
  busy,
}: CaptureControlsProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Choose a photo from your library"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onPickPhoto}
        style={[styles.library, { borderRadius: theme.radii.md + 2, opacity: busy ? 0.4 : 1 }]}
        testID="snap-library"
      >
        <Icon name="photo.on.rectangle" size={24} color="onImage" />
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Take photo"
        accessibilityState={{ disabled: !canShoot }}
        disabled={!canShoot}
        onPress={onShutter}
        style={[styles.shutter, { opacity: canShoot ? 1 : 0.4 }]}
        testID="snap-shutter"
      >
        <View style={styles.core} />
      </PressableScale>
      <View style={styles.side}>
        {onFlip ? (
          <GlassIconButton
            icon="arrow.triangle.2.circlepath.camera"
            accessibilityLabel="Flip camera"
            onPress={onFlip}
            scheme="dark"
            iconColor="onImage"
            disabled={busy}
            testID="snap-flip"
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
  },
  library: {
    width: SIDE,
    height: SIDE,
    borderWidth: 2,
    borderColor: camera.ink,
    backgroundColor: camera.capsule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: SHUTTER,
    height: SHUTTER,
    borderRadius: SHUTTER / 2,
    borderWidth: 4,
    borderColor: camera.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    width: SHUTTER - space.lg,
    height: SHUTTER - space.lg,
    borderRadius: (SHUTTER - space.lg) / 2,
    backgroundColor: camera.ink,
  },
  side: { width: SIDE, height: SIDE, alignItems: 'center', justifyContent: 'center' },
});
