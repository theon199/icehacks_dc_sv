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

export interface ResultFacts {
  /** "Indian · 35 min · 420 kcal", or "~420 kcal est." when the calories are an estimate. */
  readonly text: string;
  /** The same facts worded for VoiceOver, with an estimate said in full. */
  readonly spoken: string;
}

/**
 * Quick facts under a card's title, leaving out whatever the catalog does not know. Calories always
 * carry their confidence: an estimated figure never reads like a computed one.
 */
export function resultFacts(item: SearchResultItem): ResultFacts {
  const { recipe } = item;
  const shown = [cuisineLabel(recipe.cuisine)];
  if (recipe.totalMinutes != null) shown.push(formatMinutes(recipe.totalMinutes));
  const spoken = [...shown];
  const kcal = recipe.nutrition?.kcal;
  if (kcal != null) {
    const amount = formatKcal(kcal);
    if (recipe.nutritionConfidence === 'computed') {
      shown.push(amount);
      spoken.push(amount);
    } else {
      shown.push(`~${amount} est.`);
      spoken.push(`about ${amount}, estimated`);
    }
  }
  return { text: shown.join(' · '), spoken: spoken.join(', ') };
}

function accessibilityLabelFor(item: SearchResultItem, facts: ResultFacts): string {
  const base = `${item.recipe.title}. ${facts.spoken}`;
  return item.eligible ? base : `${base}. Does not fit you: ${item.reasons.join('; ')}`;
}

/** One cell of the results grid: photo, title, quick facts, and a safety badge when needed. */
export const ResultCard = memo(function ResultCard({ item, onOpen }: ResultCardProps) {
  const theme = useTheme();
  const { recipe } = item;
  const facts = resultFacts(item);
  return (
    <PressableScale
      testID={`search-result-${recipe.id}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelFor(item, facts)}
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
        {facts.text}
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
