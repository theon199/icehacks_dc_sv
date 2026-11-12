import { memo, useCallback, useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

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

/**
 * Horizontally paged cards under the map. A search returns at most ten places, so a snapping
 * ScrollView of memoised cards is enough; a recycling list would only add measuring work here.
 */
function PlaceStripView({ places, selection, cardWidth, onSettle, onOpen }: PlaceStripProps) {
  const scrollRef = useRef<ScrollView>(null);
  const interval = slotWidth(cardWidth, CARD_GAP);

  const { selectedId, revision } = selection;
  const follow = stripShouldFollow(selection);
  useEffect(() => {
    if (!follow || !selectedId) return;
    const index = places.findIndex((p) => p.id === selectedId);
    if (index < 0) return;
    scrollRef.current?.scrollTo({ x: offsetForIndex(index, cardWidth, CARD_GAP), animated: true });
    // `revision` re-runs this when the same marker is tapped again after a swipe.
  }, [follow, selectedId, revision, places, cardWidth]);

  const handleSettle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = indexAtOffset(
        event.nativeEvent.contentOffset.x,
        cardWidth,
        CARD_GAP,
        places.length,
      );
      const place = places[index];
      if (place) onSettle(place.id);
    },
    [cardWidth, places, onSettle],
  );

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={interval}
      snapToAlignment="start"
      disableIntervalMomentum
      contentContainerStyle={styles.content}
      onMomentumScrollEnd={handleSettle}
      accessibilityRole="list"
      accessibilityLabel="Nearby places"
      testID="nearby-strip"
    >
      {places.map((place, index) => (
        <View key={place.id} style={index > 0 ? styles.gap : null}>
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
  gap: { marginLeft: CARD_GAP },
});
