import { StyleSheet, View } from 'react-native';

import type { MyStats } from '@/lib/supabase/database.types';
import { Chip, Skeleton, space, Text, fontFamily, useTheme } from '@/ui';

import { statTiles, topCuisines, type StatKey } from '../model/stats';

export interface StatsRowProps {
  stats: MyStats | undefined;
  loading: boolean;
}

/** The streak has its own card above, so the row carries the other totals. */
const ROW_KEYS: readonly StatKey[] = ['posts', 'likes', 'cooked', 'cuisines'];

/** Posts, likes, dishes cooked and cuisines explored, plus the cuisines cooked most. */
export function StatsRow({ stats, loading }: StatsRowProps) {
  const theme = useTheme();

  if (!stats) {
    return loading ? (
      <View style={styles.tiles} testID="stats-loading">
        {ROW_KEYS.map((key) => (
          <View key={key} style={styles.flex}>
            <Skeleton height={62} radius="md" />
          </View>
        ))}
      </View>
    ) : null;
  }

  const all = statTiles(stats);
  const tiles = ROW_KEYS.flatMap((key) => all.filter((tile) => tile.key === key));
  const cuisines = topCuisines(stats);
  return (
    <View style={styles.container} testID="stats">
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <View
            key={tile.key}
            accessible
            accessibilityLabel={tile.accessibilityLabel}
            style={[styles.tile, { backgroundColor: theme.colors.surface }]}
          >
            <Text variant="title2" accessible={false} numberOfLines={1} style={styles.value}>
              {tile.value}
            </Text>
            <Text
              variant="caption"
              tone="muted"
              accessible={false}
              numberOfLines={1}
              style={styles.label}
            >
              {tile.label.toLowerCase()}
            </Text>
          </View>
        ))}
      </View>
      {cuisines.length > 0 ? (
        <View
          style={styles.cuisines}
          accessible
          accessibilityLabel={`Cuisines you cook most: ${cuisines
            .map((cuisine) => `${cuisine.label}, ${cuisine.count}`)
            .join('; ')}`}
        >
          {cuisines.map((cuisine) => (
            <Chip key={cuisine.id} tone="accent" label={`${cuisine.label} · ${cuisine.count}`} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md },
  flex: { flex: 1 },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: space.md },
  value: { fontFamily: fontFamily.displayBold },
  label: { fontFamily: fontFamily.textSemiBold },
  cuisines: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
