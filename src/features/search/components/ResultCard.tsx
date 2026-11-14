import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { cuisineLabel } from '@/domain/types';
import { formatKcal, formatMinutes } from '@/lib/format';
import { Icon, PressableScale, Text, useTheme, photoOverlay } from '@/ui';

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

/**
 * One cell of the results grid: a rounded photo tile with the title and quick facts over a dark
 * scrim, and a safety badge on top when needed.
 */
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
      style={[
        styles.tile,
        { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.lg },
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
        <View style={styles.placeholder}>
          <Icon name="fork.knife" android="restaurant" size={28} color="textSubtle" />
        </View>
      )}
      <LinearGradient
        colors={photoOverlay.scrim}
        locations={photoOverlay.scrimStops}
        style={styles.scrim}
        pointerEvents="none"
      />
      {item.badge ? (
        <View style={styles.badgeSlot}>
          <SafetyBadge label={item.badge} />
        </View>
      ) : null}
      <View style={styles.caption}>
        <Text
          variant="headline"
          numberOfLines={2}
          accessible={false}
          maxFontSizeMultiplier={1.3}
          style={{ color: item.eligible ? photoOverlay.text : photoOverlay.textMuted }}
        >
          {recipe.title}
        </Text>
        <Text
          variant="caption"
          numberOfLines={1}
          accessible={false}
          maxFontSizeMultiplier={1.3}
          style={{ color: photoOverlay.textMuted }}
        >
          {facts.text}
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: { flex: 1, aspectRatio: 0.8, overflow: 'hidden', justifyContent: 'flex-end' },
  placeholder: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%' },
  dimmed: { opacity: 0.55 },
  badgeSlot: { position: 'absolute', top: 10, left: 10, right: 10 },
  caption: { gap: 2, paddingHorizontal: 14, paddingBottom: 14 },
});
