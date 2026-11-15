import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton, HEADER_TOP_OFFSET, space } from '@/ui';

import { camera } from './cameraTheme';

export interface PhotoBackdropProps {
  /** The frozen photo; null draws the plain night backdrop. */
  photoUri: string | null;
  /** The glass circle at the top left; omitted, there is none. */
  onClose?: (() => void) | undefined;
  closeLabel?: string;
  /** A heavier dim, for a sheet of text over the photo. */
  heavy?: boolean;
  children: ReactNode;
  testID?: string;
}

/**
 * The Snap flow's stage: the photo just taken, dimmed, edge to edge on black, with a dark glass
 * close circle where the camera's was. Cards and sheets sit on top of it.
 */
export function PhotoBackdrop({
  photoUri,
  onClose,
  closeLabel = 'Close',
  heavy = false,
  children,
  testID,
}: PhotoBackdropProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root} {...(testID ? { testID } : {})}>
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessible={false}
        />
      ) : null}
      {photoUri ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, heavy ? styles.heavy : styles.dim]}
        />
      ) : null}
      {children}
      {onClose ? (
        <View
          pointerEvents="box-none"
          style={[styles.top, { top: insets.top + HEADER_TOP_OFFSET }]}
        >
          <GlassIconButton
            icon="xmark"
            accessibilityLabel={closeLabel}
            onPress={onClose}
            scheme="dark"
            iconColor="onImage"
            testID="snap-close"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: camera.black },
  dim: { backgroundColor: camera.dim },
  heavy: { backgroundColor: camera.capsule },
  top: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row' },
});
