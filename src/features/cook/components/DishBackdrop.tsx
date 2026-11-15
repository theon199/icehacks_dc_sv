import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { palettes, photoOverlay, useTheme } from '@/ui';

export interface DishBackdropProps {
  /** The cook's own photo, else the recipe's; null draws the plain dark canvas. */
  uri: string | null;
  /** Frosts the photo behind the celebration and the photo ask. */
  blurred: boolean;
}

const BLUR_INTENSITY = 40;

/** The full-bleed dish photo behind the cook-done screens, pinned dark like any photo. */
export function DishBackdrop({ uri, blurred }: DishBackdropProps) {
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: palettes.light.text }]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={theme.motion.duration.fast}
          accessible={false}
        />
      ) : null}
      {blurred ? (
        <>
          <BlurView intensity={BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: photoOverlay.chip }]} />
        </>
      ) : (
        <View style={[styles.topScrim, { backgroundColor: photoOverlay.chip }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
});
