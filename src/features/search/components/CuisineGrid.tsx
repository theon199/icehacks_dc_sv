import { useQueries } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { cuisineLabel } from '@/domain/types';
import { searchRecipes, useCuisines } from '@/lib/catalog';
import { PressableScale, Text, fontFamily, palettes, photoOverlay, space, useTheme } from '@/ui';
import { withAlpha } from '@/ui/color';

import { SectionHeading } from './SearchRows';

/** Tiles on the page at rest: enough to browse, few enough to stay a short page. */
const MAX_TILES = 12;
const TILE_HEIGHT = 92;
const FADE = [withAlpha(palettes.light.text, 0), withAlpha(palettes.light.text, 0.72)] as const;

export interface CuisineTileModel {
  cuisine: string;
  label: string;
  count: number;
}

/**
 * Which cuisines get a tile, in order: the ones the person said they love (when the catalog has
 * them), then the rest by how many recipes they have.
 */
export function cuisineTiles(
  available: readonly { cuisine: string; recipeCount: number }[],
  loved: readonly string[],
  limit = MAX_TILES,
): CuisineTileModel[] {
  const counts = new Map(available.map((row) => [row.cuisine, row.recipeCount]));
  const order = [
    ...loved.filter((cuisine) => counts.has(cuisine)),
    ...available.map((row) => row.cuisine).filter((cuisine) => !loved.includes(cuisine)),
  ];
  return order.slice(0, limit).map((cuisine) => ({
    cuisine,
    label: cuisineLabel(cuisine),
    count: counts.get(cuisine) ?? 0,
  }));
}

/** The healthiest recipe photo of each cuisine, for its tile. Missing photos leave a plain tile. */
function useCoverPhotos(cuisines: readonly string[]): ReadonlyMap<string, string> {
  const results = useQueries({
    queries: cuisines.map((cuisine) => ({
      queryKey: ['catalog', 'cuisine-cover', cuisine] as const,
      queryFn: async () => {
        const page = await searchRecipes('', { cuisines: [cuisine] });
        return page.items.find((recipe) => recipe.imageUrl != null)?.imageUrl ?? null;
      },
      staleTime: Infinity,
      retry: false,
    })),
  });
  return useMemo(() => {
    const covers = new Map<string, string>();
    results.forEach((result, index) => {
      const cuisine = cuisines[index];
      if (cuisine !== undefined && typeof result.data === 'string')
        covers.set(cuisine, result.data);
    });
    return covers;
  }, [cuisines, results]);
}

const CuisineTile = memo(function CuisineTile({
  tile,
  cover,
  onPick,
}: {
  tile: CuisineTileModel;
  cover: string | undefined;
  onPick: (cuisine: string) => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      accessibilityHint={`Shows ${tile.count} ${tile.label} recipes`}
      onPress={() => onPick(tile.cuisine)}
      style={[
        styles.tile,
        { borderRadius: theme.radii.lg, backgroundColor: theme.colors.primarySoft },
      ]}
      testID={`search-cuisine-${tile.cuisine}`}
    >
      {cover ? (
        <Image
          source={{ uri: cover }}
          recyclingKey={tile.cuisine}
          contentFit="cover"
          transition={theme.motion.duration.fast}
          accessible={false}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <LinearGradient colors={FADE} pointerEvents="none" style={styles.fade} />
      <Text
        variant="label"
        numberOfLines={1}
        accessible={false}
        maxFontSizeMultiplier={1.3}
        style={[styles.label, { color: photoOverlay.text }]}
      >
        {tile.label}
      </Text>
    </PressableScale>
  );
});

export interface CuisineGridProps {
  /** Cuisines the person said they love; their tiles come first. */
  loved: readonly string[];
  onPick: (cuisine: string) => void;
}

/** "Browse by cuisine": two columns of photo tiles. Absent until the catalog lists cuisines. */
export function CuisineGrid({ loved, onPick }: CuisineGridProps) {
  const cuisines = useCuisines();
  const tiles = useMemo(() => cuisineTiles(cuisines.data ?? [], loved), [cuisines.data, loved]);
  const ids = useMemo(() => tiles.map((tile) => tile.cuisine), [tiles]);
  const covers = useCoverPhotos(ids);
  if (tiles.length === 0) return null;
  return (
    <View style={styles.section} testID="search-cuisines">
      <SectionHeading title="Browse by cuisine" />
      <View style={styles.grid}>
        {tiles.map((tile) => (
          <CuisineTile
            key={tile.cuisine}
            tile={tile}
            cover={covers.get(tile.cuisine)}
            onPick={onPick}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm + 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 2 },
  tile: {
    // Two columns: half the row less half the gap between them.
    flexBasis: '47%',
    flexGrow: 1,
    height: TILE_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '35%' },
  label: {
    fontFamily: fontFamily.textBold,
    paddingHorizontal: space.md,
    paddingBottom: space.sm + 2,
  },
});
