import type { FlashMode } from 'expo-camera';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, IconButton, PressableScale, space, useTheme, type IconName } from '@/ui';

export type SnapFlash = Extract<FlashMode, 'off' | 'auto' | 'on'>;

const FLASH_ORDER: readonly SnapFlash[] = ['off', 'auto', 'on'];

const FLASH: Readonly<Record<SnapFlash, { icon: IconName; label: string }>> = {
  off: { icon: 'bolt.slash', label: 'Flash off' },
  auto: { icon: 'bolt.badge.automatic', label: 'Flash auto' },
  on: { icon: 'bolt.fill', label: 'Flash on' },
};

export function nextFlash(flash: SnapFlash): SnapFlash {
  return FLASH_ORDER[(FLASH_ORDER.indexOf(flash) + 1) % FLASH_ORDER.length] ?? 'off';
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
/** Size of the round buttons either side of the shutter. */
const SIDE = 52;

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
        size={SIDE}
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
        <PressableScale
          onPress={() => {
            haptics.selection();
            onFlashChange(nextFlash(flash));
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={flashInfo.label}
          accessibilityHint="Switches between flash off, auto and on."
          accessibilityState={{ disabled: busy, selected: flash !== 'off' }}
          testID="snap-flash"
          style={[
            styles.side,
            { backgroundColor: theme.colors.surfaceSunken, opacity: busy ? 0.4 : 1 },
          ]}
        >
          <Icon name={flashInfo.icon} size={SIDE / 2} color="text" weight="semibold" />
        </PressableScale>
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
    paddingHorizontal: space.xxl,
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
    width: SHUTTER - space.lg,
    height: SHUTTER - space.lg,
    borderRadius: (SHUTTER - space.lg) / 2,
  },
  side: {
    width: SIDE,
    height: SIDE,
    borderRadius: SIDE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: { width: SIDE, height: SIDE },
});
