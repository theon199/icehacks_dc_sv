import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { cuisineLabel, type DeckCard } from '@/domain';
import { formatMinutes } from '@/lib/format';
import { Chip, Icon, ProgressRing, Text, useTheme } from '@/ui';
import { space } from '@/ui/tokens';

import { nutritionLine } from '../cardText';

export interface RecipeCardProps {
  card: DeckCard;
  /** Only the top card loads its photo at high priority. */
  isTop: boolean;
}

/** The face of a Discover card: photo, fit score, the top two reasons and key nutrition. */
export const RecipeCard = memo(function RecipeCard({ card, isTop }: RecipeCardProps) {
  const theme = useTheme();
  const { recipe } = card;
  const nutrition = nutritionLine(card);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.xl,
          borderColor: theme.colors.border,
          ...theme.elevation.medium,
          shadowColor: theme.colors.shadow,
        },
      ]}
    >
      <View style={[styles.hero, { backgroundColor: theme.colors.primarySoft }]}>
        {recipe.imageUrl ? (
          <Image
            source={{ uri: recipe.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={recipe.id}
            priority={isTop ? 'high' : 'normal'}
            transition={theme.motion.duration.fast}
            accessible={false}
          />
        ) : (
          <View style={styles.placeholder}>
            <Icon name="fork.knife" android="restaurant" size={44} color="onPrimarySoft" />
          </View>
        )}
        <View
          style={[
            styles.ring,
            { backgroundColor: theme.colors.surfaceRaised, ...theme.elevation.low },
          ]}
        >
          <ProgressRing
            progress={card.fitScore / 100}
            size={56}
            strokeWidth={5}
            accessibilityLabel={`Fit score ${card.fitScore} out of 100`}
          >
            <Text variant="headline" accessible={false} maxFontSizeMultiplier={1.1}>
              {card.fitScore}
            </Text>
          </ProgressRing>
        </View>
        {card.portionScale < 1 ? (
          <Chip label="Half portion" icon="leaf" tone="primary" style={styles.portion} />
        ) : null}
      </View>

      <View style={styles.body}>
        <Text variant="title3" numberOfLines={2}>
          {recipe.title}
        </Text>
        <View style={styles.chips}>
          <Chip label={cuisineLabel(recipe.cuisine)} icon="globe" />
          {recipe.totalMinutes !== null ? (
            <Chip label={formatMinutes(recipe.totalMinutes)} icon="clock" />
          ) : null}
        </View>
        <View style={styles.reasons}>
          {card.reasons.slice(0, 2).map((reason) => (
            <View key={reason.code} style={styles.reason}>
              <Icon name="checkmark.circle.fill" android="check_circle" size={18} color="primary" />
              <Text variant="callout" numberOfLines={1} style={styles.reasonText}>
                {reason.text}
              </Text>
            </View>
          ))}
        </View>
        {nutrition ? (
          <Text variant="footnote" tone="muted" numberOfLines={1}>
            {nutrition}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  hero: { flex: 1, minHeight: 160 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    borderRadius: 36,
    padding: space.xs,
  },
  portion: { position: 'absolute', top: space.md, left: space.md },
  body: { padding: space.lg, gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  reasons: { gap: space.xs },
  reason: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  reasonText: { flex: 1 },
});
