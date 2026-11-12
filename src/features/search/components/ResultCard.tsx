import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { cuisineLabel } from '@/domain/types';
import { formatKcal, formatMinutes } from '@/lib/format';
import { Icon, PressableScale, Text, useTheme } from '@/ui';

import { SafetyBadge } from './SafetyBadge';
import type { SearchResultItem } from '../resultItems';

export interface ResultCardProps {
  item: SearchResultItem;
  onOpen: (item: SearchResultItem) => void;
}

/** "Indian · 35 min · 420 kcal", leaving out whatever the catalog does not know. */
export function resultMeta(item: SearchResultItem): string {
  const { recipe } = item;
  const parts = [cuisineLabel(recipe.cuisine)];
  if (recipe.totalMinutes != null) parts.push(formatMinutes(recipe.totalMinutes));
  const kcal = recipe.nutrition?.kcal;
  if (kcal != null) parts.push(formatKcal(kcal));
  return parts.join(' · ');
}

function accessibilityLabelFor(item: SearchResultItem, meta: string): string {
  const base = `${item.recipe.title}. ${meta}`;
  return item.eligible ? base : `${base}. Does not fit you: ${item.reasons.join('; ')}`;
}

/** One cell of the results grid: photo, title, quick facts, and a safety badge when needed. */
export const ResultCard = memo(function ResultCard({ item, onOpen }: ResultCardProps) {
  const theme = useTheme();
  const { recipe } = item;
  const meta = resultMeta(item);
  return (
    <PressableScale
      testID={`search-result-${recipe.id}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelFor(item, meta)}
      accessibilityHint="Opens the recipe"
      onPress={() => onOpen(item)}
      style={styles.card}
    >
      <View
        style={[
          styles.photo,
          { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.md },
        ]}
      >
        {recipe.imageUrl ? (
          <Image
            source={{ uri: recipe.imageUrl }}
            recyclingKey={recipe.id}
            contentFit="cover"
            transition={theme.motion.duration.fast}
            priority="normal"
            accessible={false}
            style={[StyleSheet.absoluteFill, !item.eligible && styles.dimmed]}
          />
        ) : (
          <Icon name="fork.knife" android="restaurant" size={28} color="textSubtle" />
        )}
        {item.badge ? (
          <View style={styles.badgeSlot}>
            <SafetyBadge label={item.badge} />
          </View>
        ) : null}
      </View>
      <Text
        variant="subhead"
        numberOfLines={2}
        accessible={false}
        tone={item.eligible ? 'default' : 'muted'}
      >
        {recipe.title}
      </Text>
      <Text variant="footnote" tone="subtle" numberOfLines={1} accessible={false}>
        {meta}
      </Text>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, gap: 4 },
  photo: {
    aspectRatio: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dimmed: { opacity: 0.55 },
  badgeSlot: { position: 'absolute', top: 8, left: 8, right: 8 },
});
