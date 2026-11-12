import { memo, useCallback, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';

import { gutter } from '@/ui';

import { PlaceCard } from './PlaceCard';
import type { PlaceView } from '../model/placeView';
import {
  indexAtOffset,
  offsetForIndex,
  slotWidth,
  stripShouldFollow,
  type SelectionState,
} from '../model/selection';

export const CARD_GAP = 12;

export interface PlaceStripProps {
  places: readonly PlaceView[];
  selection: SelectionState;
  cardWidth: number;
  /** The card the strip settled on after a swipe. */
  onSettle: (id: string) => void;
  onOpen: (id: string) => void;
}

type MomentumEnd = NonNullable<ScrollViewProps['onMomentumScrollEnd']>;

/**
 * Horizontally paged cards under the map. A search returns at most ten places, so a snapping
 * ScrollView of memoised cards is enough; a recycling list would only add measuring work here.
 */
function PlaceStripView({ places, selection, cardWidth, onSettle, onOpen }: PlaceStripProps) {
  const pager = useRef<ScrollView>(null);
  const { selectedId, revision } = selection;

  // Follow on the selected card's position, not on the `places` array: a tally update rebuilds
  // the array without moving any card, and must not scroll the strip.
  const followIndex = stripShouldFollow(selection)
    ? places.findIndex((p) => p.id === selectedId)
    : -1;
  useEffect(() => {
    if (followIndex < 0) return;
    const x = offsetForIndex(followIndex, cardWidth, CARD_GAP);
    pager.current?.scrollTo({ x, animated: true });
    // `revision` re-runs this when the same marker is tapped again after a swipe.
  }, [followIndex, revision, cardWidth]);

  const settle = useCallback<MomentumEnd>(
    ({ nativeEvent }) => {
      const at = indexAtOffset(nativeEvent.contentOffset.x, cardWidth, CARD_GAP, places.length);
      const landed = places[at];
      if (landed) onSettle(landed.id);
    },
    [cardWidth, places, onSettle],
  );

  return (
    <ScrollView
      ref={pager}
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={slotWidth(cardWidth, CARD_GAP)}
      snapToAlignment="start"
      disableIntervalMomentum
      contentContainerStyle={styles.content}
      onMomentumScrollEnd={settle}
      accessibilityRole="list"
      accessibilityLabel="Restaurants on the map"
      testID="nearby-strip"
    >
      {places.map((place, index) => (
        <View key={place.id} style={index === 0 ? null : styles.spaced}>
          <PlaceCard
            place={place}
            selected={place.id === selectedId}
            width={cardWidth}
            onOpen={onOpen}
          />
        </View>
      ))}
    </ScrollView>
  );
}

export const PlaceStrip = memo(PlaceStripView);

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingVertical: 8 },
  spaced: { marginLeft: CARD_GAP },
});
