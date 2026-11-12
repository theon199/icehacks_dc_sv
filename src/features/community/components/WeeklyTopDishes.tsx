import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { formatNumber } from '@/lib/format';
import { Card, Icon, PressableScale, Text, useTheme } from '@/ui';

import { useWeeklyTopDishes, type WeeklyTopDish } from '../hooks/useRecipes';

function DishTile({ dish, rank }: { dish: WeeklyTopDish; rank: number }) {
  const theme = useTheme();
  const cooks = `${formatNumber(dish.cooks, 0)} cook${dish.cooks === 1 ? '' : 's'}`;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Number ${rank}: ${dish.recipe.title}, cooked by ${cooks} this week`}
      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: dish.recipe.id } })}
      style={styles.tile}
    >
      <View
        style={[
          styles.thumb,
          { borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceSunken },
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
          style={[styles.rank, { backgroundColor: theme.colors.surfaceRaised }]}
          accessible={false}
        >
          <Text variant="caption" accessible={false}>
            {rank}
          </Text>
        </View>
      </View>
      <Text variant="footnote" numberOfLines={2} accessible={false}>
        {dish.recipe.title}
      </Text>
      <Text variant="caption" tone="subtle" accessible={false}>
        {cooks}
      </Text>
    </PressableScale>
  );
}

/** "Cooked most this week" strip at the top of the feed. Hidden until there is something to show. */
export function WeeklyTopDishes() {
  const dishes = useWeeklyTopDishes();
  if (dishes.length === 0) return null;
  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.heading}>
        <Icon name="flame.fill" android="local_fire_department" size={18} color="accent" />
        <Text variant="headline">Cooked most this week</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {dishes.map((dish, index) => (
          <DishTile key={dish.recipe.id} dish={dish} rank={index + 1} />
        ))}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  strip: { gap: 12 },
  tile: { width: 112, gap: 4 },
  thumb: {
    width: 112,
    height: 84,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: {
    position: 'absolute',
    top: 6,
    left: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
