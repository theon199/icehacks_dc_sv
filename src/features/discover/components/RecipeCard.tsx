import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { cuisineLabel, type DeckCard } from '@/domain';
import { Icon, Text, useTheme, photoOverlay } from '@/ui';
import { space } from '@/ui/tokens';

import { cardStats } from '../cardText';

export interface RecipeCardProps {
  card: DeckCard;
  /** Only the top card loads its photo at high priority. */
  isTop: boolean;
}

/**
 * The face of a Discover card: a full-bleed photo with the fit score on top, and the cuisine,
 * title, the top two reasons and key stats over a dark scrim at the bottom. The whole card is read
 * by VoiceOver as one label set on the swipeable wrapper, so nothing here is focusable.
 */
export const RecipeCard = memo(function RecipeCard({ card, isTop }: RecipeCardProps) {
  const theme = useTheme();
  const { recipe } = card;
  const stats = cardStats(card);
  const radius = { borderRadius: theme.radii.xl };

  return (
    <View
      style={[
        styles.shadow,
        radius,
        { ...theme.elevation.medium, shadowColor: theme.colors.shadow },
      ]}
    >
      <View style={[styles.card, radius, { backgroundColor: theme.colors.primarySoft }]}>
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
        <LinearGradient
          colors={photoOverlay.scrim}
          locations={photoOverlay.scrimStops}
          style={styles.scrim}
          pointerEvents="none"
        />

        <View style={styles.top}>
          <View
            style={[
              styles.pill,
              { backgroundColor: theme.colors.highlight, borderRadius: theme.radii.pill },
            ]}
          >
            <Text
              variant="label"
              color="onHighlight"
              accessible={false}
              maxFontSizeMultiplier={1.3}
            >
              {`${card.fitScore}% fit`}
            </Text>
          </View>
          {card.portionScale < 1 ? (
            <View
              style={[
                styles.pill,
                styles.row,
                { backgroundColor: photoOverlay.chip, borderRadius: theme.radii.pill },
              ]}
            >
              <Icon name="leaf" android="eco" size={14} color="highlight" weight="semibold" />
              <Text
                variant="label"
                style={{ color: photoOverlay.text }}
                accessible={false}
                maxFontSizeMultiplier={1.3}
              >
                Half portion
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Text
            variant="overline"
            style={{ color: photoOverlay.textMuted }}
            numberOfLines={1}
            accessible={false}
          >
            {cuisineLabel(recipe.cuisine)}
          </Text>
          <Text
            variant="display"
            style={[styles.title, { color: photoOverlay.text }]}
            numberOfLines={2}
            accessible={false}
            maxFontSizeMultiplier={1.3}
          >
            {recipe.title}
          </Text>
          {card.reasons.slice(0, 2).map((reason) => (
            <View key={reason.code} style={styles.row}>
              <Icon
                name="checkmark.circle.fill"
                android="check_circle"
                size={16}
                color="highlight"
              />
              <Text
                variant="subhead"
                numberOfLines={1}
                style={[styles.reasonText, { color: photoOverlay.textMuted }]}
                accessible={false}
              >
                {reason.text}
              </Text>
            </View>
          ))}
          {stats.length > 0 ? (
            <View style={styles.stats}>
              {stats.map((stat) => (
                <View
                  key={stat}
                  style={[
                    styles.stat,
                    { backgroundColor: photoOverlay.chip, borderRadius: theme.radii.pill },
                  ]}
                >
                  <Text
                    variant="label"
                    style={{ color: photoOverlay.text }}
                    numberOfLines={1}
                    accessible={false}
                    maxFontSizeMultiplier={1.3}
                  >
                    {stat}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  shadow: { flex: 1 },
  card: { flex: 1, overflow: 'hidden', justifyContent: 'space-between' },
  placeholder: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: space.lg,
  },
  pill: { paddingHorizontal: space.md, paddingVertical: space.xs + 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.xs + 2 },
  title: { fontSize: 28, lineHeight: 33 },
  reasonText: { flex: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2, paddingTop: space.sm },
  stat: { paddingHorizontal: space.md, paddingVertical: space.xs + 3 },
});
