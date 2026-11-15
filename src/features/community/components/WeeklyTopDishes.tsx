import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { formatNumber } from '@/lib/format';
import { Icon, Text, fontFamily, gutter, palettes, space, useTheme } from '@/ui';
import { withAlpha } from '@/ui/color';

import { CookedCountChip } from './CookedCountChip';
import { useWeeklyTopDishes, type WeeklyTopDish } from '../hooks/useRecipes';

/** About three and a half tiles fit across, so the cut-off one says "more this way". */
const VISIBLE_TILES = 3.5;
const TILE_GAP = space.sm;
const MIN_TILE = 88;
const MAX_TILE = 128;
/** Story-shaped: a little taller than wide. */
const TILE_ASPECT = 1.3;
const NUMERAL_SHADOW = withAlpha(palettes.light.text, 0.55);

export function railTileWidth(windowWidth: number): number {
  const visibleGaps = Math.floor(VISIBLE_TILES);
  const fit = (windowWidth - gutter - visibleGaps * TILE_GAP) / VISIBLE_TILES;
  return Math.floor(Math.min(MAX_TILE, Math.max(MIN_TILE, fit)));
}

interface DishTileProps {
  dish: WeeklyTopDish;
  rank: number;
  width: number;
}

const DishTile = memo(function DishTile({ dish, rank, width }: DishTileProps) {
  const theme = useTheme();
  const cooks = `${formatNumber(dish.cooks, 0)} cook${dish.cooks === 1 ? '' : 's'}`;
  const id = dish.recipe.id;
  const open = useCallback(() => router.push({ pathname: '/recipe/[id]', params: { id } }), [id]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Number ${rank}: ${dish.recipe.title}, cooked by ${cooks} this week`}
      accessibilityHint="Opens this recipe"
      onPress={open}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.art,
          {
            height: Math.round(width * TILE_ASPECT),
            borderRadius: theme.radii.lg,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        {dish.recipe.imageUrl ? (
          <Image
            source={{ uri: dish.recipe.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={dish.recipe.id}
            transition={150}
            accessible={false}
          />
        ) : (
          <Icon name="fork.knife" android="restaurant" size={28} color="textSubtle" />
        )}
        <Text
          color="onImage"
          style={[styles.rank, { textShadowColor: NUMERAL_SHADOW }]}
          accessible={false}
          maxFontSizeMultiplier={1}
        >
          {rank}
        </Text>
        <View style={styles.countSlot}>
          <CookedCountChip count={dish.cooks} />
        </View>
      </View>
      <Text variant="caption" numberOfLines={1} accessible={false} style={styles.title}>
        {dish.recipe.title}
      </Text>
    </Pressable>
  );
});

/** "Most cooked this week" rail at the top of the feed. Hidden until there is something to show. */
export function WeeklyTopDishes() {
  const dishes = useWeeklyTopDishes();
  const { width: windowWidth } = useWindowDimensions();
  if (dishes.length === 0) return null;
  const width = railTileWidth(windowWidth);
  return (
    <View style={styles.block} testID="most-cooked">
      <Text variant="headline" accessibilityRole="header" style={styles.heading}>
        Most cooked this week
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.strip}
      >
        {dishes.map((dish, index) => (
          <DishTile key={dish.recipe.id} dish={dish} rank={index + 1} width={width} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  heading: { fontFamily: fontFamily.textBold },
  // The rail runs to the screen's right edge instead of stopping at the gutter.
  bleed: { marginRight: -gutter },
  strip: { gap: TILE_GAP, paddingRight: gutter },
  tile: { gap: space.xs },
  pressed: { opacity: 0.78 },
  art: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  countSlot: { position: 'absolute', top: space.xs, right: space.xs },
  rank: {
    position: 'absolute',
    left: space.sm,
    bottom: 0,
    fontFamily: fontFamily.displayBold,
    fontSize: 40,
    lineHeight: 46,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  title: { fontFamily: fontFamily.textSemiBold },
});
