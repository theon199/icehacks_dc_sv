import { Image } from 'expo-image';
import { memo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, gutter, photoOverlay, space, useTheme } from '@/ui';

/** Height of the rounded photo card. */
export const HERO_HEIGHT = 300;
/** The transparent navigation bar the card starts under. */
const NAV_BAR_HEIGHT = 44;

/** A photo looks the same in light and dark appearance, so its credit capsule does too. */
const creditColors = { background: photoOverlay.chip, text: photoOverlay.text };

/** Space above the hero card: the status bar and the navigation bar's back button. */
export function useHeroTopInset(): number {
  return useSafeAreaInsets().top + NAV_BAR_HEIGHT + space.sm;
}

export interface RecipeHeroProps {
  imageUrl: string | null;
  title: string;
  credit: string | null;
  /** Vertical scroll offset of the list; drives the parallax. */
  scrollY: Animated.Value;
  /** Skip parallax when the person prefers reduced motion. */
  reduceMotion: boolean;
}

/**
 * The recipe photo as a rounded card under the navigation bar. Inside the card the photo moves at
 * half the scroll speed and grows on pull-down; both effects run on the native driver.
 */
export const RecipeHero = memo(function RecipeHero({
  imageUrl,
  title,
  credit,
  scrollY,
  reduceMotion,
}: RecipeHeroProps) {
  const theme = useTheme();
  const top = useHeroTopInset();
  const motion = reduceMotion
    ? undefined
    : {
        transform: [
          {
            translateY: scrollY.interpolate({
              inputRange: [-HERO_HEIGHT, 0, HERO_HEIGHT],
              outputRange: [-HERO_HEIGHT / 2, 0, HERO_HEIGHT * 0.5],
              extrapolateRight: 'clamp',
            }),
          },
          {
            scale: scrollY.interpolate({
              inputRange: [-HERO_HEIGHT, 0],
              outputRange: [2, 1],
              extrapolate: 'clamp',
            }),
          },
        ],
      };

  return (
    <View style={[styles.outer, { paddingTop: top }]}>
      <View
        style={[
          styles.frame,
          { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.xl },
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, motion]}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              priority="high"
              transition={200}
              cachePolicy="memory-disk"
              accessibilityLabel={`Photo of ${title}`}
              accessible
            />
          ) : (
            <View style={styles.placeholder}>
              <Icon name="fork.knife" android="restaurant" size={48} color="textSubtle" />
            </View>
          )}
        </Animated.View>
        {credit ? (
          <View
            style={[
              styles.credit,
              { backgroundColor: creditColors.background, borderRadius: theme.radii.pill },
            ]}
          >
            <Text variant="caption" numberOfLines={1} style={{ color: creditColors.text }}>
              {credit}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  outer: { paddingHorizontal: gutter },
  frame: { height: HERO_HEIGHT, overflow: 'hidden' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  credit: {
    position: 'absolute',
    right: space.md,
    bottom: space.md,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xxs + 1,
    maxWidth: '70%',
  },
});
