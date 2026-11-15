import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { cuisineLabel, type DeckCard } from '@/domain';
import { Icon, Text, useTheme } from '@/ui';
import { fontFamily, radii, space } from '@/ui/tokens';

import { cardOverlay } from './cardOverlay';
import { MeltScrim } from './MeltScrim';
import { cardStats, matchText } from '../cardText';

export interface RecipeCardProps {
  card: DeckCard;
  /** Only the top card loads its photo at high priority and pays for the melt's blur. */
  isTop: boolean;
  /** True while the top card moves; the melt drops its blur until it rests. */
  moving?: SharedValue<boolean>;
}

/** Inset of the match chip from the card's top-left corner. */
const CHIP_INSET = 14;
/** Inset of the words from the card's sides and foot. */
const BODY_INSET = 18;

/**
 * The face of a Discover card: one full-bleed photo with the lime match chip at the top left, and
 * over the melt at the foot the cuisine kicker, the dish name and one row of dark figure chips. A
 * figure the recipe does not carry is not drawn. The swipeable wrapper reads the whole card as one
 * label, so nothing here is focusable; the reasons live on the card's back.
 */
export const RecipeCard = memo(function RecipeCard({ card, isTop, moving }: RecipeCardProps) {
  const theme = useTheme();
  const { recipe } = card;
  const stats = cardStats(card);

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.primarySoft }]}>
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
      <MeltScrim blur={isTop} {...(moving === undefined ? {} : { moving })} />

      <View
        style={[
          styles.match,
          styles.chip,
          {
            backgroundColor: theme.colors.highlight,
            ...theme.elevation.low,
            shadowColor: theme.colors.shadow,
          },
        ]}
      >
        <Text
          variant="caption"
          color="onHighlight"
          style={styles.bold}
          accessible={false}
          maxFontSizeMultiplier={1.3}
        >
          {matchText(card)}
        </Text>
      </View>
      {card.portionScale < 1 ? (
        <View style={[styles.portion, styles.chip, styles.darkChip]}>
          <Text
            variant="caption"
            numberOfLines={1}
            style={[styles.bold, { color: cardOverlay.text }]}
            accessible={false}
            maxFontSizeMultiplier={1.3}
          >
            Half portion
          </Text>
        </View>
      ) : null}

      <View style={styles.body}>
        <Text
          variant="overline"
          style={{ color: cardOverlay.textMuted }}
          numberOfLines={1}
          accessible={false}
        >
          {cuisineLabel(recipe.cuisine)}
        </Text>
        <Text
          variant="title1"
          style={[styles.title, { color: cardOverlay.text }]}
          numberOfLines={2}
          accessible={false}
          accessibilityRole="none"
          maxFontSizeMultiplier={1.3}
        >
          {recipe.title}
        </Text>
        {stats.length > 0 ? (
          <View style={styles.stats}>
            {stats.map((stat) => (
              <View key={stat} style={[styles.stat, styles.darkChip]}>
                <Text
                  variant="label"
                  style={[styles.bold, { color: cardOverlay.text }]}
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
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderRadius: radii.card,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    position: 'absolute',
    top: CHIP_INSET,
    borderRadius: radii.pill,
    paddingVertical: 5,
    paddingHorizontal: space.md - 2,
  },
  match: { left: CHIP_INSET },
  portion: { right: CHIP_INSET, maxWidth: '55%' },
  darkChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cardOverlay.chipBorder,
    backgroundColor: cardOverlay.chip,
  },
  bold: { fontFamily: fontFamily.textBold },
  body: { paddingHorizontal: BODY_INSET, paddingBottom: BODY_INSET },
  title: { marginTop: space.xs },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md },
  stat: {
    paddingVertical: 7,
    paddingHorizontal: space.md,
    borderRadius: radii.pill,
  },
});
