import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { cardOverlay } from './cardOverlay';

/** Share of the card height the dark gradient covers, from the bottom edge. */
export const MELT_HEIGHT = 0.46;

/** Share of the melt the blur reaches: it stops short of the photo above the words. */
const BLUR_SHARE = 0.6;

/**
 * The blur is built from bands that each cover the zone from a lower start down to the foot, so
 * they stack: light at the top edge, strongest at the bottom. Each band is weak, so its own top
 * edge stays invisible under the dark gradient.
 */
const BLUR_BANDS = [1, 0.66, 0.33] as const;
const BAND_INTENSITY = 16;

export interface MeltScrimProps {
  /** Only the top card pays for the blur; cards beneath keep the gradient alone. */
  blur: boolean;
  /**
   * True while the card moves (drag, flight, flip). A moving backdrop blur re-samples every frame,
   * so it is switched off (a hard 0/1, never a fade) and the gradient carries the darkening alone.
   */
  moving?: SharedValue<boolean>;
}

/**
 * The bottom of the card photo dissolving into the words laid over it: a progressive blur under a
 * dark gradient that is clear at its top edge.
 */
export const MeltScrim = memo(function MeltScrim({ blur, moving }: MeltScrimProps) {
  const blurStyle = useAnimatedStyle(() => ({ opacity: moving?.get() === true ? 0 : 1 }));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.melt}
      testID="discover-card-melt"
    >
      {blur ? (
        <Animated.View style={[styles.blurZone, blurStyle]}>
          {BLUR_BANDS.map((share) => (
            <BlurView
              key={share}
              intensity={BAND_INTENSITY}
              tint="dark"
              style={[styles.band, { height: `${share * 100}%` }]}
            />
          ))}
        </Animated.View>
      ) : null}
      <LinearGradient colors={cardOverlay.melt} style={StyleSheet.absoluteFill} />
    </View>
  );
});

const styles = StyleSheet.create({
  melt: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: `${MELT_HEIGHT * 100}%`,
  },
  blurZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: `${BLUR_SHARE * 100}%`,
  },
  band: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
