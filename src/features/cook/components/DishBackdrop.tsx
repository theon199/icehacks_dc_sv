import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { palettes, photoOverlay, useTheme } from '@/ui';
import { withAlpha } from '@/ui/color';

export interface DishBackdropProps {
  /** The cook's own photo, else the recipe's; null draws the plain dark canvas. */
  uri: string | null;
  /** Frosts the photo behind the celebration and the photo ask. */
  blurred: boolean;
}

const BLUR_INTENSITY = 40;

/**
 * Darkens the top of the photo under the white header, then fades out with no edge of its own:
 * as dark as the header's chip at the top, easing to clear well below the dish name.
 */
const TOP_SCRIM_HEIGHT = 240;
const ink = palettes.light.text;
const TOP_SCRIM = {
  colors: [photoOverlay.chip, withAlpha(ink, 0.4), withAlpha(ink, 0.16), withAlpha(ink, 0)],
  locations: [0, 0.45, 0.75, 1],
} as const;

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
        <LinearGradient
          colors={TOP_SCRIM.colors}
          locations={TOP_SCRIM.locations}
          style={styles.topScrim}
          testID="dish-backdrop-scrim"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: TOP_SCRIM_HEIGHT },
});
