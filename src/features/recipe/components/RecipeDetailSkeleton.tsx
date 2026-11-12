import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonGroup, gutter, space } from '@/ui';

import { HERO_HEIGHT } from './RecipeHero';

/** Placeholder with the recipe screen's shape while the catalog read completes. */
export function RecipeDetailSkeleton() {
  return (
    <SkeletonGroup label="Loading recipe">
      <Skeleton height={HERO_HEIGHT} radius="xs" />
      <View style={styles.body}>
        <Skeleton width="30%" height={14} />
        <Skeleton width="80%" height={30} />
        <Skeleton width="60%" height={18} />
        <Skeleton height={84} radius="lg" />
        <Skeleton height={64} radius="md" />
        <Skeleton width="45%" height={24} />
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  body: { padding: gutter, gap: space.md },
});
