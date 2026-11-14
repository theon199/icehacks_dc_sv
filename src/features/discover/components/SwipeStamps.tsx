import { StyleSheet } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Text, useTheme, photoOverlay } from '@/ui';
import { space } from '@/ui/tokens';

export interface SwipeStampsProps {
  /** The card's horizontal drag offset. */
  x: SharedValue<number>;
  /** Drag distance at which a swipe decides; the matching stamp is fully shown there. */
  distance: number;
}

/** "Like" and "Pass" capsules that fade in on the top card as it is dragged towards each side. */
export function SwipeStamps({ x, distance }: SwipeStampsProps) {
  const theme = useTheme();
  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, distance], [0, 1], 'clamp'),
  }));
  const passStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [-distance, 0], [1, 0], 'clamp'),
  }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.stamp,
          styles.left,
          { backgroundColor: theme.colors.highlight, borderRadius: theme.radii.pill },
          likeStyle,
        ]}
      >
        <Text variant="headline" color="onHighlight" accessible={false}>
          Like
        </Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.stamp,
          styles.right,
          { backgroundColor: photoOverlay.chip, borderRadius: theme.radii.pill },
          passStyle,
        ]}
      >
        <Text variant="headline" style={{ color: photoOverlay.text }} accessible={false}>
          Pass
        </Text>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  stamp: {
    position: 'absolute',
    top: space.giant + space.xxl,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  left: { left: space.xl, transform: [{ rotate: '-12deg' }] },
  right: { right: space.xl, transform: [{ rotate: '12deg' }] },
});
