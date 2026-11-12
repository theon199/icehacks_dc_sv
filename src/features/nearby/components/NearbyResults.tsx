import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, ErrorState, Screen, Skeleton, SkeletonGroup, gutter } from '@/ui';

import { AreaBar } from './AreaBar';
import { NearbyMap } from './NearbyMap';
import { PlaceSheet } from './PlaceSheet';
import { PlaceStrip } from './PlaceStrip';
import type { NearbyLocation } from '../hooks/useNearbyLocation';
import { useNearbyPlaces } from '../hooks/useNearbyPlaces';
import { usePlaceSelection } from '../hooks/usePlaceSelection';
import type { NearbyDish } from '../model/dish';
import type { NearbyOrigin } from '../model/permission';

export interface NearbyResultsProps {
  dish: NearbyDish;
  origin: NearbyOrigin;
  location: NearbyLocation;
}

/** Height reserved for the card strip over the map. */
const STRIP_HEIGHT = 140;
const CARD_PEEK = 36;
const MAX_CARD_WIDTH = 340;

/** The map, card strip and place sheet for one dish around one origin. */
export function NearbyResults({ dish, origin, location }: NearbyResultsProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(MAX_CARD_WIDTH, width - gutter * 2 - CARD_PEEK);
  const places = useNearbyPlaces(dish, origin);
  const list = useMemo(() => places.result?.places ?? [], [places.result]);
  const ids = useMemo(() => list.map((p) => p.id), [list]);
  const { selection, selectFromMap, selectFromStrip } = usePlaceSelection(ids);
  const [openId, setOpenId] = useState<string | null>(null);

  const openPlace = useCallback(
    (id: string) => {
      selectFromStrip(id);
      setOpenId(id);
    },
    [selectFromStrip],
  );
  const closeSheet = useCallback(() => setOpenId(null), []);
  const padding = useMemo(
    () => ({ top: 64, right: 0, bottom: STRIP_HEIGHT + insets.bottom, left: 0 }),
    [insets.bottom],
  );

  const changeArea = location.chooseCity;
  const kind = places.result?.kind;

  if (places.isError && !places.result) {
    return (
      <Screen>
        <ErrorState
          error={places.error}
          title="Couldn't search nearby"
          onRetry={() => void places.refetch()}
        />
        <Button label="Search another area" variant="ghost" onPress={changeArea} />
      </Screen>
    );
  }

  if (kind === 'notConfigured' || kind === 'budget') {
    return (
      <Screen>
        <EmptyState
          icon="map"
          title="Nearby search is resting"
          message={
            kind === 'budget'
              ? "We've reached this month's search limit. Please try again in a few days."
              : "Restaurant search isn't available right now. Please check back later."
          }
        />
      </Screen>
    );
  }

  if (kind === 'empty') {
    return (
      <Screen>
        <EmptyState
          icon="fork.knife"
          title={`No ${dish.name} found nearby`}
          message="We looked within about 5 km. Try another area, or cook a healthier version at home."
          actionLabel="Search another area"
          onAction={changeArea}
        />
      </Screen>
    );
  }

  const selected = list.find((p) => p.id === openId) ?? null;

  return (
    <View style={styles.root}>
      <NearbyMap
        origin={origin}
        places={list}
        selection={selection}
        onSelect={selectFromMap}
        padding={padding}
      />
      <AreaBar origin={origin} onChange={changeArea} />
      <View style={[styles.strip, { paddingBottom: insets.bottom + 8 }]}>
        {places.result ? (
          <PlaceStrip
            places={list}
            selection={selection}
            cardWidth={cardWidth}
            onSettle={selectFromStrip}
            onOpen={openPlace}
          />
        ) : (
          <SkeletonGroup label="Finding places" style={styles.loading}>
            <Skeleton width={cardWidth} height={112} radius="lg" />
          </SkeletonGroup>
        )}
      </View>
      <PlaceSheet
        dish={dish}
        place={selected}
        places={list}
        bucket={places.bucket}
        onClose={closeSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  strip: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  loading: { paddingHorizontal: gutter, paddingVertical: 8 },
});
