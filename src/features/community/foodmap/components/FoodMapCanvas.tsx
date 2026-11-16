import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polygon, type EdgePadding } from 'react-native-maps';

import { Icon, Text, fontFamily, useTheme } from '@/ui';
import { withAlpha } from '@/ui/color';

import {
  regionFillOpacity,
  type CheckInDot,
  type MapPoint,
  type RegionView,
  type SpotView,
} from '../model';

export interface FoodMapCanvasProps {
  centre: MapPoint;
  regions: readonly RegionView[];
  spots: readonly SpotView[];
  dots: readonly CheckInDot[];
  selectedId: string | null;
  onSelectSpot: (placeId: string) => void;
  onRegionPress: () => void;
  /** Space covered by the header and the card, so the camera centres in what is visible. */
  padding: EdgePadding;
}

const CAMERA_MS = 650;
/** About 1.6 km across: a few neighbourhoods around the person. */
const START_DELTA = 0.016;
const PIN = 26;
const PIN_SELECTED = 34;

function dotSize(visits: number): number {
  return 2 * (4 + Math.min(visits, 8) * 0.5);
}

/**
 * The city map: neighbourhoods tinted by progress and recent visits (solid once claimed, dashed
 * while untouched), the person's check-ins as dots, and a leaf pin for every healthy spot not yet
 * visited. The selected spot's pin is dark with its name above it, and the camera flies to it.
 */
function FoodMapCanvasView({
  centre,
  regions,
  spots,
  dots,
  selectedId,
  onSelectSpot,
  onRegionPress,
  padding,
}: FoodMapCanvasProps) {
  const theme = useTheme();
  const { colors } = theme;
  const mapRef = useRef<MapView>(null);
  // The first frame only; later moves follow the selection.
  const [initialRegion] = useState(() => ({
    ...centre,
    latitudeDelta: START_DELTA,
    longitudeDelta: START_DELTA,
  }));

  const selected = spots.find((spot) => spot.placeId === selectedId) ?? null;
  const targetLat = selected?.point.latitude;
  const targetLng = selected?.point.longitude;
  useEffect(() => {
    if (targetLat === undefined || targetLng === undefined) return;
    mapRef.current?.animateCamera(
      { center: { latitude: targetLat, longitude: targetLng } },
      { duration: CAMERA_MS },
    );
  }, [targetLat, targetLng]);

  const pins = spots.filter((spot) => spot.visits === 0 || spot.placeId === selectedId);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      mapPadding={padding}
      showsUserLocation
      showsPointsOfInterests={false}
      showsCompass={false}
      toolbarEnabled={false}
      userInterfaceStyle={theme.scheme}
      accessibilityLabel="Food map of the neighbourhoods around you"
      testID="food-map-canvas"
    >
      {regions.map((region) => {
        const claimed = region.state === 'claimed';
        const open = region.state === 'open' || region.state === 'empty';
        return (
          <Polygon
            key={region.id}
            coordinates={[...region.outline]}
            holes={region.holes.map((ring) => [...ring])}
            fillColor={withAlpha(colors.territory, regionFillOpacity(region))}
            strokeColor={
              claimed ? colors.territoryDeep : open ? colors.territoryLine : colors.territory
            }
            strokeWidth={claimed ? 3 : open ? 1.8 : 2}
            {...(open ? { lineDashPattern: [6, 5] } : {})}
            tappable
            onPress={onRegionPress}
          />
        );
      })}

      {dots.map((dot) => {
        const size = dotSize(dot.visits);
        return (
          <Marker
            key={`dot-${dot.placeId}`}
            coordinate={dot.point}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={1}
          >
            <View
              style={[
                styles.dot,
                {
                  width: size + 4,
                  height: size + 4,
                  borderRadius: (size + 4) / 2,
                  backgroundColor: colors.territoryDeep,
                  borderColor: colors.onImage,
                },
              ]}
            />
          </Marker>
        );
      })}

      {regions.map((region) => (
        <Marker
          key={`label-${region.id}`}
          coordinate={region.labelAt}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          onPress={onRegionPress}
          zIndex={2}
        >
          <View
            style={styles.label}
            accessibilityLabel={region.label ? `${region.name}, ${region.label}` : region.name}
          >
            <Text
              style={[
                styles.labelName,
                {
                  color: region.state === 'claimed' ? colors.territoryDeep : colors.text,
                  textShadowColor: colors.background,
                },
              ]}
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
            >
              {region.name}
            </Text>
            {region.label ? (
              <Text
                style={[
                  styles.labelProgress,
                  {
                    color: region.state === 'claimed' ? colors.territoryDeep : colors.textMuted,
                    textShadowColor: colors.background,
                  },
                ]}
                maxFontSizeMultiplier={1.2}
              >
                {region.label}
              </Text>
            ) : null}
          </View>
        </Marker>
      ))}

      {pins.map((spot) => {
        const on = spot.placeId === selectedId;
        return (
          <Marker
            // A new key when the selection changes redraws the pin's snapshot.
            key={`pin-${spot.placeId}-${on ? 'on' : 'off'}`}
            coordinate={spot.point}
            anchor={{ x: 0.5, y: on ? 0.78 : 0.5 }}
            tracksViewChanges={false}
            onPress={() => onSelectSpot(spot.placeId)}
            zIndex={on ? 4 : 3}
            accessibilityLabel={spot.name}
            testID={`food-map-pin-${spot.placeId}`}
          >
            <View style={styles.pinWrap}>
              {on ? (
                <View style={[styles.pinName, { backgroundColor: colors.primary }]}>
                  <Text
                    style={[styles.pinNameText, { color: colors.onPrimary }]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                  >
                    {spot.name}
                  </Text>
                </View>
              ) : null}
              <View
                style={[
                  on ? styles.halo : null,
                  on ? { backgroundColor: withAlpha(colors.highlight, 0.35) } : null,
                ]}
              >
                <View
                  style={[
                    styles.pin,
                    on ? styles.pinOn : null,
                    {
                      backgroundColor: on ? colors.primary : colors.surface,
                      borderColor: on ? colors.highlight : colors.primary,
                    },
                  ]}
                >
                  <Icon name="leaf" size={on ? 17 : 14} color={on ? 'highlight' : 'primary'} />
                </View>
              </View>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

export const FoodMapCanvas = memo(FoodMapCanvasView);

const styles = StyleSheet.create({
  dot: { borderWidth: 2 },
  label: { alignItems: 'center', maxWidth: 160 },
  labelName: {
    fontFamily: fontFamily.textBold,
    fontSize: 12,
    lineHeight: 15,
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
  labelProgress: {
    fontFamily: fontFamily.textBold,
    fontSize: 10.5,
    lineHeight: 13,
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
  pinWrap: { alignItems: 'center' },
  pinName: {
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 12,
    justifyContent: 'center',
    marginBottom: 4,
    maxWidth: 220,
  },
  pinNameText: { fontFamily: fontFamily.textBold, fontSize: 12.5, lineHeight: 16 },
  halo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinOn: {
    width: PIN_SELECTED,
    height: PIN_SELECTED,
    borderRadius: PIN_SELECTED / 2,
    borderWidth: 3,
  },
});
