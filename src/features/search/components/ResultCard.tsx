import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { cuisineLabel } from '@/domain/types';
import { formatKcal, formatMinutes } from '@/lib/format';
import { Icon, PressableScale, Text, fontFamily, space, useTheme } from '@/ui';

import { SafetyBadge } from './SafetyBadge';
import { ROW_THUMB, SearchRow } from './SearchRows';
import type { SearchResultItem } from '../resultItems';

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

const TOP_CARD = 150;

export interface ResultViewProps {
  item: SearchResultItem;
  onOpen: (item: SearchResultItem) => void;
}

/** The recipe's photo, dimmed when it does not fit the person; a fork glyph when there is none. */
function ResultPhoto({ item, style }: { item: SearchResultItem; style: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const { recipe } = item;
  return (
    <View style={[style, styles.photo, { backgroundColor: theme.colors.surfaceSunken }]}>
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
        <Icon name="fork.knife" android="restaurant" size={22} color="textSubtle" />
      )}
    </View>
  );
}

/**
 * A "Top Results" card: a square photo with the title and quick facts under it, and a safety
 * badge on the photo when the recipe does not fit.
 */
export const TopResultCard = memo(function TopResultCard({ item, onOpen }: ResultViewProps) {
  const theme = useTheme();
  const facts = resultFacts(item);
  return (
    <PressableScale
      testID={`search-result-${item.recipe.id}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelFor(item, facts)}
      accessibilityHint="Opens the recipe"
      onPress={() => onOpen(item)}
      style={styles.topCard}
    >
      <View>
        <ResultPhoto item={item} style={[styles.topArt, { borderRadius: theme.radii.lg }]} />
        {item.badge ? (
          <View style={styles.badgeSlot}>
            <SafetyBadge label={item.badge} />
          </View>
        ) : null}
      </View>
      <Text
        variant="label"
        numberOfLines={2}
        accessible={false}
        maxFontSizeMultiplier={1.3}
        tone={item.eligible ? 'default' : 'muted'}
        style={styles.bold}
      >
        {item.recipe.title}
      </Text>
      <Text
        variant="caption"
        tone="muted"
        numberOfLines={1}
        accessible={false}
        maxFontSizeMultiplier={1.3}
      >
        {facts.text}
      </Text>
    </PressableScale>
  );
});

/** A row in the "Recipes" list: thumbnail, title, "Recipe · facts", and a safety badge if needed. */
export const RecipeResultRow = memo(function RecipeResultRow({ item, onOpen }: ResultViewProps) {
  const theme = useTheme();
  const facts = resultFacts(item);
  return (
    <SearchRow
      testID={`search-result-${item.recipe.id}`}
      accessibilityLabel={accessibilityLabelFor(item, facts)}
      accessibilityHint="Opens the recipe"
      onPress={() => onOpen(item)}
      thumb={<ResultPhoto item={item} style={[styles.thumb, { borderRadius: theme.radii.md }]} />}
      title={item.recipe.title}
      subtitle={`Recipe · ${facts.text}`}
      {...(item.badge ? { badge: <SafetyBadge label={item.badge} /> } : {})}
    />
  );
});

const styles = StyleSheet.create({
  photo: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.55 },
  topCard: { width: TOP_CARD, gap: 2 },
  topArt: { width: TOP_CARD, height: TOP_CARD, marginBottom: space.xs },
  badgeSlot: { position: 'absolute', top: space.sm, left: space.sm, right: space.sm },
  bold: { fontFamily: fontFamily.textBold },
  thumb: { width: ROW_THUMB, height: ROW_THUMB },
});
