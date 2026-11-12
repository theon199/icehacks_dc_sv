import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, type EdgePadding } from 'react-native-maps';

import { useTheme } from '@/ui';

import { regionFor } from '../model/geo';
import type { NearbyOrigin } from '../model/permission';
import type { PlaceView } from '../model/placeView';
import { mapShouldFollow, type SelectionState } from '../model/selection';

export interface NearbyMapProps {
  origin: NearbyOrigin;
  places: readonly PlaceView[];
  selection: SelectionState;
  onSelect: (id: string) => void;
  /** Space covered by overlays (the card strip), so the camera centres in what is visible. */
  padding: EdgePadding;
}

const CAMERA_MS = 350;

/** Map of the search area with one marker per place; follows selections made on the strip. */
function NearbyMapView({ origin, places, selection, onSelect, padding }: NearbyMapProps) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);

  const region = useMemo(
    () =>
      regionFor(
        origin.point,
        places.map((p) => p.point),
      ),
    [origin.point, places],
  );

  // Frame every result whenever the result set (or origin) changes.
  useEffect(() => {
    mapRef.current?.animateToRegion(region, CAMERA_MS);
  }, [region]);

  const { selectedId } = selection;
  const follow = mapShouldFollow(selection);
  const { revision } = selection;
  useEffect(() => {
    if (!follow || !selectedId) return;
    const place = places.find((p) => p.id === selectedId);
    if (place) mapRef.current?.animateCamera({ center: place.point }, { duration: CAMERA_MS });
    // `revision` re-runs this for a repeated selection of the same place.
  }, [follow, selectedId, revision, places]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      mapPadding={padding}
      showsUserLocation={origin.source === 'device'}
      showsPointsOfInterests={false}
      showsCompass={false}
      toolbarEnabled={false}
      userInterfaceStyle={theme.scheme}
      accessibilityLabel="Map of nearby places"
      testID="nearby-map"
    >
      {places.map((place) => {
        const selected = place.id === selectedId;
        return (
          <Marker
            key={place.id}
            identifier={place.id}
            coordinate={place.point}
            title={place.name}
            pinColor={selected ? theme.colors.primary : theme.colors.accent}
            zIndex={selected ? 2 : 1}
            tracksViewChanges={false}
            onPress={() => onSelect(place.id)}
            accessibilityLabel={place.name}
            testID={`nearby-marker-${place.id}`}
          />
        );
      })}
    </MapView>
  );
}

export const NearbyMap = memo(NearbyMapView);
