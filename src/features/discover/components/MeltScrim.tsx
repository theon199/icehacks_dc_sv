import MaskedView from '@react-native-masked-view/masked-view';
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

/** One backdrop blur, faded in by a gradient mask: clear at its top edge, full from 45% down. */
const BLUR_INTENSITY = 48;
const MASK = ['rgba(0,0,0,0)', 'rgba(0,0,0,1)'] as const;
const MASK_STOPS = [0, 0.45] as const;

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
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
                colors={MASK}
                locations={MASK_STOPS}
                style={StyleSheet.absoluteFill}
              />
            }
          >
            <BlurView intensity={BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFill} />
          </MaskedView>
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
});
