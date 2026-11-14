import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonGroup, gutter, space } from '@/ui';

import { HERO_HEIGHT } from './RecipePageHero';

/** Placeholder with the recipe page's shape (photo, tiles, tabs, pane) while the catalog reads. */
export function RecipeDetailSkeleton() {
  return (
    <SkeletonGroup label="Loading recipe" style={styles.body}>
      <Skeleton height={HERO_HEIGHT} radius="card" />
      <View style={styles.tiles}>
        <View style={styles.flex}>
          <Skeleton height={86} radius="lg" />
        </View>
        <View style={styles.flex}>
          <Skeleton height={86} radius="lg" />
        </View>
      </View>
      <Skeleton height={44} radius="pill" />
      <Skeleton height={140} radius="tile" />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.xs, gap: space.md },
  tiles: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});
