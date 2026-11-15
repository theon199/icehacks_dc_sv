import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deviceLocale } from '@/lib/format';
import { Button, EmptyState, ErrorState, Screen, Skeleton, SkeletonGroup, space } from '@/ui';

import { BelowNearbyHeader, nearbyHeaderBottom } from './NearbyHeader';
import { NearbyMap } from './NearbyMap';
import { PlaceSheet } from './PlaceSheet';
import { CARD_GAP, CARD_PEEK, PlaceStrip, STRIP_INSET } from './PlaceStrip';
import type { NearbyLocation } from '../hooks/useNearbyLocation';
import { SEARCH_RADIUS_M, useNearbyPlaces, type NearbyResultKind } from '../hooks/useNearbyPlaces';
import { usePlaceSelection } from '../hooks/usePlaceSelection';
import type { NearbyDish } from '../model/dish';
import { distanceUnitFor, formatDistance } from '../model/geo';
import type { NearbyOrigin } from '../model/permission';

export interface NearbyResultsProps {
  dish: NearbyDish;
  origin: NearbyOrigin;
  location: NearbyLocation;
}

/** Height reserved for the card strip over the map. */
const STRIP_HEIGHT = 124;
const NARROWEST_CARD = 240;

/** Card width for a screen width: as wide as fits while part of the next card still peeks in. */
function cardWidthFor(screenWidth: number): number {
  return Math.max(NARROWEST_CARD, screenWidth - STRIP_INSET - CARD_GAP - CARD_PEEK);
}

/** Full-screen notices for searches that produced no map: nothing found, or search unavailable. */
function NoMap({
  kind,
  dishName,
  onChangeArea,
}: {
  kind: Exclude<NearbyResultKind, 'places'>;
  dishName: string;
  onChangeArea: () => void;
}) {
  if (kind === 'empty') {
    const radius = formatDistance(SEARCH_RADIUS_M, distanceUnitFor(deviceLocale()));
    return (
      <BelowNearbyHeader>
        <Screen>
          <EmptyState
            icon="fork.knife"
            title={`No ${dishName} found nearby`}
            message={`We looked within about ${radius}. Try another area, or cook a healthier version at home.`}
            actionLabel="Search another area"
            onAction={onChangeArea}
          />
        </Screen>
      </BelowNearbyHeader>
    );
  }
  return (
    <BelowNearbyHeader>
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
    </BelowNearbyHeader>
  );
}

/** The map, card strip and place sheet for one dish around one origin. */
export function NearbyResults({ dish, origin, location }: NearbyResultsProps) {
  const safeArea = useSafeAreaInsets();
  const cardWidth = cardWidthFor(useWindowDimensions().width);
  const search = useNearbyPlaces(dish, origin);
  const { result } = search;

  const places = useMemo(() => result?.places ?? [], [result]);
  const placeIds = useMemo(() => places.map((p) => p.id), [places]);
  const { selection, selectFromMap, selectFromStrip } = usePlaceSelection(placeIds);

  // The sheet shows whichever place was last opened from the strip; null keeps it closed.
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const showSheet = useCallback(
    (id: string) => {
      selectFromStrip(id);
      setSheetFor(id);
    },
    [selectFromStrip],
  );
  const hideSheet = useCallback(() => setSheetFor(null), []);

  const stripBottom = STRIP_HEIGHT + safeArea.bottom;
  const headerBottom = nearbyHeaderBottom(safeArea.top);
  const mapPadding = useMemo(
    () => ({ top: headerBottom + space.sm, right: 0, bottom: stripBottom, left: 0 }),
    [headerBottom, stripBottom],
  );

  if (search.isError && !result) {
    return (
      <BelowNearbyHeader>
        <Screen>
          <ErrorState
            error={search.error}
            title="Couldn't search nearby"
            onRetry={() => void search.refetch()}
          />
          <Button label="Search another area" variant="ghost" onPress={location.chooseCity} />
        </Screen>
      </BelowNearbyHeader>
    );
  }

  if (result && result.kind !== 'places') {
    return <NoMap kind={result.kind} dishName={dish.name} onChangeArea={location.chooseCity} />;
  }

  const sheetPlace = sheetFor === null ? null : (places.find((p) => p.id === sheetFor) ?? null);

  return (
    <View style={styles.fill}>
      <NearbyMap
        origin={origin}
        places={places}
        selection={selection}
        onSelect={selectFromMap}
        padding={mapPadding}
      />
      <View style={[styles.dock, { paddingBottom: Math.max(safeArea.bottom, space.md) }]}>
        {result ? (
          <PlaceStrip
            places={places}
            selection={selection}
            cardWidth={cardWidth}
            onSettle={selectFromStrip}
            onOpen={showSheet}
          />
        ) : (
          <SkeletonGroup label="Finding places" style={styles.placeholder}>
            <Skeleton width={cardWidth} height={84} radius="tile" />
          </SkeletonGroup>
        )}
      </View>
      <PlaceSheet
        dish={dish}
        place={sheetPlace}
        places={places}
        bucket={search.bucket}
        onClose={hideSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  placeholder: { paddingHorizontal: STRIP_INSET, paddingVertical: 14 },
});
