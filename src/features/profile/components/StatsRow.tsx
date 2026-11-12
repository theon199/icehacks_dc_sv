import { StyleSheet, View } from 'react-native';

import type { MyStats } from '@/lib/supabase/database.types';
import { Chip, Skeleton, space, Text, useTheme } from '@/ui';

import { isFreshStart, statTiles, topCuisines } from '../model/stats';

export interface StatsRowProps {
  stats: MyStats | undefined;
  loading: boolean;
}

/** Cooking and community numbers, plus the cuisines cooked most. */
export function StatsRow({ stats, loading }: StatsRowProps) {
  const theme = useTheme();

  if (!stats) {
    return loading ? (
      <View style={styles.tiles} testID="stats-loading">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} width="30%" height={64} radius="md" />
        ))}
      </View>
    ) : null;
  }

  const tiles = statTiles(stats);
  const cuisines = topCuisines(stats);
  return (
    <View style={styles.container} testID="stats">
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <View
            key={tile.key}
            accessible
            accessibilityLabel={tile.accessibilityLabel}
            style={[
              styles.tile,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text variant="title2" accessible={false}>
              {tile.value}
            </Text>
            <Text variant="caption" tone="muted" accessible={false}>
              {tile.label}
            </Text>
            {tile.caption ? (
              <Text variant="caption" tone="primary" accessible={false}>
                {tile.caption}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {isFreshStart(stats) ? (
        <Text variant="footnote" tone="muted">
          Cook a recipe and mark it done to start your streak and earn your first badge.
        </Text>
      ) : null}
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
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.xxs,
  },
  cuisines: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
