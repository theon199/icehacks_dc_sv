import { Image } from 'expo-image';
import { memo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Icon, Text, useTheme } from '@/ui';

export const HERO_HEIGHT = 340;

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
 * Full-bleed photo at the top of the recipe. It moves at half the scroll speed and stretches on
 * pull-down; both effects run on the native driver.
 */
export const RecipeHero = memo(function RecipeHero({
  imageUrl,
  title,
  credit,
  scrollY,
  reduceMotion,
}: RecipeHeroProps) {
  const theme = useTheme();
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
    <View style={[styles.frame, { backgroundColor: theme.colors.surfaceSunken }]}>
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
        <View style={[styles.credit, { backgroundColor: theme.colors.surfaceRaised }]}>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {credit}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { height: HERO_HEIGHT, overflow: 'hidden' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  credit: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: '70%',
  },
});
