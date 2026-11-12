import type { FlashMode } from 'expo-camera';
import { StyleSheet, View } from 'react-native';

import { IconButton, PressableScale, useTheme, type IconName } from '@/ui';

export type SnapFlash = Extract<FlashMode, 'off' | 'auto' | 'on'>;

const FLASH_ORDER: readonly SnapFlash[] = ['off', 'auto', 'on'];

const FLASH: Readonly<Record<SnapFlash, { icon: IconName; label: string }>> = {
  off: { icon: 'bolt.slash', label: 'Flash off' },
  auto: { icon: 'bolt.badge.automatic', label: 'Flash auto' },
  on: { icon: 'bolt.fill', label: 'Flash on' },
};

export function nextFlash(flash: SnapFlash): SnapFlash {
  return FLASH_ORDER[(FLASH_ORDER.indexOf(flash) + 1) % FLASH_ORDER.length] as SnapFlash;
}

export interface CaptureControlsProps {
  flash: SnapFlash;
  onFlashChange: (flash: SnapFlash) => void;
  onShutter: () => void;
  onPickPhoto: () => void;
  /** The camera is ready and nothing is in progress. */
  canShoot: boolean;
  /** Flash only applies to the live camera. */
  showFlash: boolean;
  busy: boolean;
}

const SHUTTER = 76;

export function CaptureControls({
  flash,
  onFlashChange,
  onShutter,
  onPickPhoto,
  canShoot,
  showFlash,
  busy,
}: CaptureControlsProps) {
  const theme = useTheme();
  const flashInfo = FLASH[flash];
  return (
    <View style={styles.row}>
      <IconButton
        icon="photo.on.rectangle"
        accessibilityLabel="Choose a photo from your library"
        onPress={onPickPhoto}
        variant="tinted"
        size={52}
        disabled={busy}
        testID="snap-library"
      />
      <PressableScale
        onPress={onShutter}
        disabled={!canShoot}
        accessibilityRole="button"
        accessibilityLabel="Take photo"
        accessibilityState={{ disabled: !canShoot }}
        testID="snap-shutter"
        style={[
          styles.shutter,
          {
            borderColor: theme.colors.primary,
            opacity: canShoot ? 1 : 0.4,
          },
        ]}
      >
        <View style={[styles.shutterCore, { backgroundColor: theme.colors.primary }]} />
      </PressableScale>
      {showFlash ? (
        <IconButton
          icon={flashInfo.icon}
          accessibilityLabel={`${flashInfo.label}. Double-tap to change.`}
          onPress={() => onFlashChange(nextFlash(flash))}
          variant="tinted"
          size={52}
          disabled={busy}
          selected={flash !== 'off'}
          testID="snap-flash"
        />
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  shutter: {
    width: SHUTTER,
    height: SHUTTER,
    borderRadius: SHUTTER / 2,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: {
    width: SHUTTER - 16,
    height: SHUTTER - 16,
    borderRadius: (SHUTTER - 16) / 2,
  },
  placeholder: { width: 52, height: 52 },
});
