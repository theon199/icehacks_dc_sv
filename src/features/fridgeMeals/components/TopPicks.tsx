import { memo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';

import type { MealTimePick } from '@/domain';
import { gutter, space } from '@/ui';

import { MealPhotoCard } from './MealPhotoCard';
import type { IngredientNames } from '../mealText';

export interface TopPicksProps {
  picks: readonly MealTimePick[];
  names: IngredientNames;
  onOpen: (id: string) => void;
}

const CARD_WIDTH = 268;
const CARD_ASPECT = 300 / 268;
/** How much of the next card peeks in on a narrow phone, so the row reads as scrollable. */
const PEEK = 56;

/** The best picks as a row of big photo cards that scrolls sideways. */
export const TopPicks = memo(function TopPicks({ picks, names, onOpen }: TopPicksProps) {
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.round(Math.min(CARD_WIDTH, screenWidth - gutter - PEEK));
  const height = Math.round(width * CARD_ASPECT);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={width + space.md}
      snapToAlignment="start"
      contentContainerStyle={styles.row}
      style={styles.scroller}
      testID="fridge-meals-top"
    >
      {picks.map((pick) => (
        <MealPhotoCard
          key={pick.recipe.id}
          pick={pick}
          names={names}
          width={width}
          height={height}
          onOpen={onOpen}
        />
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  // The row runs edge to edge while its first card lines up with the page gutter.
  scroller: { marginHorizontal: -gutter },
  row: { gap: space.md, paddingHorizontal: gutter, paddingBottom: space.xs },
});
