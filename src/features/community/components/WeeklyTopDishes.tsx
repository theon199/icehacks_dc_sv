import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { formatNumber } from '@/lib/format';
import {
  Icon,
  PressableScale,
  Text,
  fontFamily,
  gutter,
  space,
  useTheme,
  type Palette,
} from '@/ui';

import { useWeeklyTopDishes, type WeeklyTopDish } from '../hooks/useRecipes';

/** About three and a half tiles fit across, so the cut-off one says "more this way". */
const VISIBLE_TILES = 3.5;
const TILE_GAP = space.sm;
const MIN_TILE = 96;
const MAX_TILE = 128;
const TILE_ASPECT = 1.25;
const RING = 3;

function tileWidth(windowWidth: number): number {
  const visibleGaps = Math.floor(VISIBLE_TILES);
  const fit = (windowWidth - gutter - visibleGaps * TILE_GAP) / VISIBLE_TILES;
  return Math.round(Math.min(MAX_TILE, Math.max(MIN_TILE, fit)));
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
  const height = Math.round(width * TILE_ASPECT);
  // Marks on photos stay light in both appearances.
  const onPhoto: keyof Palette = 'onImage';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Number ${rank}: ${dish.recipe.title}, cooked by ${cooks} this week`}
      onPress={open}
      style={[styles.tile, { width }]}
    >
      <View
        style={[
          styles.ring,
          {
            width,
            height,
            borderRadius: theme.radii.lg + RING,
            borderColor: theme.colors.highlight,
          },
        ]}
      >
        <View
          style={[
            styles.art,
            { borderRadius: theme.radii.lg, backgroundColor: theme.colors.surfaceSunken },
          ]}
        >
          {dish.recipe.imageUrl ? (
            <Image
              source={{ uri: dish.recipe.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              recyclingKey={dish.recipe.id}
              accessible={false}
            />
          ) : (
            <Icon name="fork.knife" android="restaurant" size={28} color="textSubtle" />
          )}
          <View
            style={[
              styles.count,
              { backgroundColor: theme.colors.scrim, borderRadius: theme.radii.pill },
            ]}
            accessible={false}
          >
            <Icon name="checkmark.circle" android="check_circle" size={14} color={onPhoto} />
            <Text variant="label" color={onPhoto} accessible={false}>
              {`${formatNumber(dish.cooks, 0)}×`}
            </Text>
          </View>
          <Text
            color={onPhoto}
            style={[styles.rank, { textShadowColor: theme.colors.shadow }]}
            accessible={false}
            maxFontSizeMultiplier={1}
          >
            {rank}
          </Text>
        </View>
      </View>
      <Text variant="footnote" numberOfLines={1} accessible={false} style={styles.title}>
        {dish.recipe.title}
      </Text>
    </PressableScale>
  );
});

/** "Most cooked this week" rail at the top of the feed. Hidden until there is something to show. */
export function WeeklyTopDishes() {
  const dishes = useWeeklyTopDishes();
  const { width: windowWidth } = useWindowDimensions();
  if (dishes.length === 0) return null;
  const width = tileWidth(windowWidth);
  return (
    <View style={styles.block}>
      <Text variant="title3">Most cooked this week</Text>
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
  block: { gap: space.md },
  // The rail runs to the screen's right edge instead of stopping at the gutter.
  bleed: { marginRight: -gutter },
  strip: { gap: TILE_GAP, paddingRight: gutter },
  tile: { gap: space.xs + 2 },
  ring: { borderWidth: RING, padding: 0 },
  art: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  count: {
    position: 'absolute',
    top: space.sm,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
  },
  rank: {
    position: 'absolute',
    left: space.sm,
    bottom: -2,
    fontFamily: fontFamily.displayBold,
    fontSize: 40,
    lineHeight: 46,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  title: { fontFamily: fontFamily.textSemiBold },
});
