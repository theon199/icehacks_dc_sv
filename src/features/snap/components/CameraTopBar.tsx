import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/lib/haptics';
import { GlassIconButton, HEADER_TOP_OFFSET, radii, space, Text } from '@/ui';

import { camera } from './cameraTheme';
import { FLASH, nextFlash, type SnapFlash } from './CaptureControls';

export interface CameraTopBarProps {
  onClose: () => void;
  /** Null hides the flash control (front camera, or no live preview). */
  flash: SnapFlash | null;
  onFlash: (flash: SnapFlash) => void;
  /** The capsule under the controls: the frame hint, or why snapping is off. Null hides it. */
  hint: string | null;
  busy: boolean;
}

/** The close and flash circles over the camera, with the hint capsule below them. */
export function CameraTopBar({ onClose, flash, onFlash, hint, busy }: CameraTopBarProps) {
  const insets = useSafeAreaInsets();
  const flashInfo = flash ? FLASH[flash] : null;
  return (
    <View pointerEvents="box-none" style={[styles.top, { top: insets.top + HEADER_TOP_OFFSET }]}>
      <View style={styles.row}>
        <GlassIconButton
          icon="xmark"
          accessibilityLabel="Close camera"
          onPress={onClose}
          scheme="dark"
          iconColor="onImage"
          testID="snap-close"
        />
        {flash && flashInfo ? (
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
            disabled={busy}
            testID="snap-flash"
          />
        ) : null}
      </View>
      {hint ? (
        <View style={styles.hint}>
          <Text variant="label" style={styles.ink} testID="snap-hint">
            {hint}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: space.lg, right: space.lg, gap: space.md },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  hint: {
    alignSelf: 'center',
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: camera.capsule,
    borderWidth: 0.5,
    borderColor: camera.hairline,
  },
  ink: { color: camera.ink },
});
