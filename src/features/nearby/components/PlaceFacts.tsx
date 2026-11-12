import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/ui';

import type { PlaceView } from '../model/placeView';

export interface PlaceFactsProps {
  place: PlaceView;
}

/** One line of facts: rating, distance, open now and price level. */
function PlaceFactsView({ place }: PlaceFactsProps) {
  return (
    <View style={styles.row} importantForAccessibility="no-hide-descendants">
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
