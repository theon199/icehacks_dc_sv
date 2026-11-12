import { StyleSheet } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Text, useTheme } from '@/ui';
import { space } from '@/ui/tokens';

export interface SwipeStampsProps {
  /** The card's horizontal drag offset. */
  x: SharedValue<number>;
  /** Drag distance at which a swipe decides; the matching stamp is fully shown there. */
  distance: number;
}

/** "Like" and "Pass" labels that fade in on the top card as it is dragged towards each side. */
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
        style={[styles.stamp, styles.left, { borderColor: theme.colors.primary }, likeStyle]}
      >
        <Text variant="headline" color="primary" accessible={false}>
          Like
        </Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.stamp, styles.right, { borderColor: theme.colors.accent }, passStyle]}
      >
        <Text variant="headline" color="accent" accessible={false}>
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
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderWidth: 3,
    borderRadius: 10,
  },
  left: { left: space.xl, transform: [{ rotate: '-12deg' }] },
  right: { right: space.xl, transform: [{ rotate: '12deg' }] },
});
