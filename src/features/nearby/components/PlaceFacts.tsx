import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/ui';

import { placeFactsLabel, type PlaceView } from '../model/placeView';

export interface PlaceFactsProps {
  place: PlaceView;
  /**
   * Inside a card that already speaks a label covering these facts, the row stays silent on both
   * platforms; on its own (the place sheet) it is read as one phrase.
   */
  silent?: boolean;
}

/**
 * One line of facts: rating, distance, open now and price level. The row is a single accessibility
 * element with a spoken label, so screen readers say "Price level 2 of 4" rather than "$$".
 */
function PlaceFactsView({ place, silent = false }: PlaceFactsProps) {
  const label = silent ? null : placeFactsLabel(place);
  const a11y = silent
    ? {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      }
    : { accessible: label !== null, accessibilityLabel: label ?? undefined };
  return (
    <View style={styles.row} {...a11y} testID="nearby-place-facts">
      {place.rating ? (
        <View style={styles.item}>
          <Icon name="star.fill" size={13} color="highlight" />
          <Text variant="footnote">
            {place.rating}
            {place.reviews ? (
              <Text variant="footnote" tone="subtle">
                {` (${place.reviews})`}
              </Text>
            ) : null}
          </Text>
        </View>
      ) : null}
      {place.distance ? (
        <Text variant="footnote" tone="muted">
          {place.distance}
        </Text>
      ) : null}
      {place.open === 'open' ? (
        <Text variant="footnote" tone="success">
          Open now
        </Text>
      ) : null}
      {place.open === 'closed' ? (
        <Text variant="footnote" tone="danger">
          Closed
        </Text>
      ) : null}
      {place.price ? (
        <Text variant="footnote" tone="muted">
          {place.price}
        </Text>
      ) : null}
    </View>
  );
}

export const PlaceFacts = memo(PlaceFactsView);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
