import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text, photoOverlay, radii, space, useTheme } from '@/ui';

import { CookButton } from './CookButton';

/** The photo keeps a landscape crop: the whole recipe page scrolls under it. */
export const HERO_HEIGHT = 190;

export interface RecipePageHeroProps {
  title: string;
  imageUrl: string | null;
  credit: string | null;
  onCook: () => void;
}

/**
 * The dish photo as a rounded card carrying only the way into cooking it: "Cook it" at the bottom
 * right, and the photo's credit at the top left where the image licence asks for it.
 */
export const RecipePageHero = memo(function RecipePageHero({
  title,
  imageUrl,
  credit,
  onCook,
}: RecipePageHeroProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.frame, { backgroundColor: theme.colors.surfaceSunken }]}
      testID="recipe-hero"
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          priority="high"
          transition={theme.motion.duration.base}
          cachePolicy="memory-disk"
          accessibilityLabel={`Photo of ${title}`}
          accessible
        />
      ) : (
        <View style={styles.placeholder}>
          <Icon name="fork.knife" android="restaurant" size={48} color="textSubtle" />
        </View>
      )}
      {credit ? (
        <View style={styles.credit}>
          <Text
            variant="caption"
            numberOfLines={1}
            style={{ color: photoOverlay.text }}
            maxFontSizeMultiplier={1.3}
          >
            {credit}
          </Text>
        </View>
      ) : null}
      <View style={styles.cook}>
        <CookButton title={title} onPress={onCook} testID="recipe-cook" />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { height: HERO_HEIGHT, borderRadius: radii.card, overflow: 'hidden' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  credit: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    maxWidth: '60%',
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radii.pill,
    backgroundColor: photoOverlay.chip,
  },
  cook: { position: 'absolute', right: space.md, bottom: space.md },
});
