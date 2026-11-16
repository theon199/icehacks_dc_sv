import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/lib/haptics';
import {
  GlassIconButton,
  TabHeader,
  Text,
  errorMessageFor,
  space,
  toast,
  useTabHeaderHeight,
  useTheme,
} from '@/ui';

import { CommunityStateCard } from '../components/CommunityStateCard';
import { useCommunityViewMenu } from '../components/CommunityViewMenu';
import { ProfileButton } from '../deps';
import { checkInSuccessMessage } from '../foodmap/checkInMessages';
import { AchievementsSheet } from '../foodmap/components/AchievementsSheet';
import { FoodMapCanvas } from '../foodmap/components/FoodMapCanvas';
import { MapStats } from '../foodmap/components/MapStats';
import { SpotCard } from '../foodmap/components/SpotCard';
import { SpotDetailsSheet } from '../foodmap/components/SpotDetailsSheet';
import { expoFoodMapLocation, type FoodMapLocation } from '../foodmap/location';
import { buildFoodMapView, type FoodMapView, type SpotView } from '../foodmap/model';
import {
  CheckInStopped,
  checkInErrorMessage,
  isAreaFilling,
  useCheckIn,
  useFoodMapOrigin,
  useFoodMapQuery,
  type FoodMapOrigin,
} from '../foodmap/useFoodMap';
import { useForgetOtherViewers, useViewer } from '../hooks/queryKeys';

export interface FoodMapScreenProps {
  /** Replaces the device location (tests). */
  location?: FoodMapLocation;
}

/** Height kept clear for the header's stats row, under the title row. */
const STATS_ROW = 42;
/** The card's photo strip and info bar, for the map's bottom padding. */
const CARD_HEIGHT = 240;

/**
 * Community's food map: the neighbourhoods around the person on a map, tinted by where they eat
 * and solid where they have claimed every healthy spot. A card (A3a) pages through the healthy
 * spots nearby, nearest first; the map flies to each one. Details and Achievements open as sheets.
 */
export function FoodMapScreen({ location = expoFoodMapLocation }: FoodMapScreenProps) {
  const theme = useTheme();
  const viewer = useViewer();
  useForgetOtherViewers(viewer);
  const insets = useSafeAreaInsets();
  const headerHeight = useTabHeaderHeight();
  const { height: windowHeight } = useWindowDimensions();
  const viewMenu = useCommunityViewMenu('map');

  const origin = useFoodMapOrigin(location);
  const fix = origin.state.step === 'located' ? origin.state.fix : null;
  const query = useFoodMapQuery(fix);
  const { data } = query;
  const view = useMemo<FoodMapView | null>(
    () => (data && fix ? buildFoodMapView({ response: data, origin: fix, now: new Date() }) : null),
    [data, fix],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'details' | 'achievements' | null>(null);
  const spots = useMemo(() => view?.spots ?? [], [view]);
  const index = Math.max(
    0,
    spots.findIndex((spot) => spot.placeId === selectedId),
  );
  const current: SpotView | null = spots[index] ?? null;

  const select = useCallback((placeId: string) => {
    haptics.selection();
    setSelectedId(placeId);
  }, []);
  const step = useCallback(
    (by: number) => {
      if (spots.length === 0) return;
      const next = spots[(index + by + spots.length) % spots.length];
      if (next) select(next.placeId);
    },
    [index, select, spots],
  );

  const checkIn = useCheckIn(location);
  const { mutate } = checkIn;
  const claimedHere = view?.claimedHere ?? 0;
  const regionCount = view?.claimable.length ?? 0;
  const startCheckIn = useCallback(
    (spot: SpotView) => {
      haptics.impact('medium');
      mutate(
        { spot },
        {
          onSuccess: (result) => {
            const outcome = checkInSuccessMessage(spot.name, result, {
              claimed: claimedHere + (result.claimedNow ? 1 : 0),
              total: regionCount,
            });
            if (outcome.claimed) haptics.success();
            setSheet(null);
            toast.show({ message: outcome.message, tone: 'success' });
          },
          onError: (error) => {
            const settings = error instanceof CheckInStopped && error.needsSettings;
            toast.show({
              message: checkInErrorMessage(error),
              tone: 'danger',
              ...(settings ? { action: { label: 'Settings', onPress: origin.openSettings } } : {}),
            });
          },
        },
      );
    },
    [claimedHere, mutate, origin.openSettings, regionCount],
  );
  const checkingInAt = checkIn.isPending ? (checkIn.variables?.spot.placeId ?? null) : null;

  const openAchievements = useCallback(() => setSheet('achievements'), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  const bottom = insets.bottom + space.md;
  const padding = useMemo(
    () => ({
      top: headerHeight + STATS_ROW,
      bottom: Math.min(CARD_HEIGHT + bottom, windowHeight * 0.45),
      left: 0,
      right: 0,
    }),
    [bottom, headerHeight, windowHeight],
  );

  let overlay: ReactNode = null;
  if (!view) overlay = <MapStatus origin={origin} query={query} />;
  else if (current) {
    overlay = (
      <SpotCard
        spot={current}
        position={{ index, count: spots.length }}
        checkingIn={checkingInAt === current.placeId}
        onPrevious={() => step(-1)}
        onNext={() => step(1)}
        onDetails={() => setSheet('details')}
        onCheckIn={() => startCheckIn(current)}
      />
    );
  } else overlay = <NoSpots view={view} onRetry={() => void query.refetch()} />;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      {view && fix ? (
        <FoodMapCanvas
          centre={{ latitude: fix.lat, longitude: fix.lng }}
          regions={view.regions}
          spots={spots}
          dots={view.dots}
          selectedId={current?.placeId ?? null}
          onSelectSpot={select}
          onRegionPress={openAchievements}
          padding={padding}
        />
      ) : null}
      <TabHeader
        title={viewMenu.title}
        titleMenu={viewMenu.titleMenu}
        titleMenuRef={viewMenu.titleMenuRef}
        floating
        surface={view ? 'frost' : 'canvas'}
        testID="food-map-header"
        trailing={
          <>
            <GlassIconButton
              icon="trophy"
              accessibilityLabel="Achievements"
              onPress={openAchievements}
              disabled={!view}
              testID="food-map-achievements-button"
            />
            <ProfileButton testID="food-map-profile" />
          </>
        }
        below={
          view ? <MapStats view={view} onAchievements={openAchievements} onTarget={select} /> : null
        }
      />
      {viewMenu.menu}
      <View style={[styles.bottom, { bottom }]} pointerEvents="box-none">
        {view && data?.attribution.osm ? (
          <Text
            variant="caption"
            color="textMuted"
            style={styles.credit}
            maxFontSizeMultiplier={1.2}
          >
            © OpenStreetMap contributors
          </Text>
        ) : null}
        {overlay}
      </View>
      <SpotDetailsSheet
        spot={sheet === 'details' ? current : null}
        checkingIn={checkingInAt !== null && checkingInAt === current?.placeId}
        onClose={closeSheet}
        onCheckIn={startCheckIn}
      />
      <AchievementsSheet visible={sheet === 'achievements'} view={view} onClose={closeSheet} />
    </View>
  );
}

/** Where the map stands before there is anything to draw: location, the first fill, a failure. */
function MapStatus({
  origin,
  query,
}: {
  origin: FoodMapOrigin;
  query: ReturnType<typeof useFoodMapQuery>;
}) {
  const { state } = origin;
  switch (state.step) {
    case 'checking':
    case 'locating':
      return (
        <CommunityStateCard
          loading
          loadingLabel="Finding where you are"
          title="Finding where you are"
          message="The food map starts from your location."
          testID="food-map-locating"
        />
      );
    case 'ask':
      return (
        <CommunityStateCard
          title="See where you eat"
          message="The food map uses your location while you use the app, to show the neighbourhoods around you. Your position is never stored."
          actions={[{ label: 'Allow location', onPress: origin.requestAccess }]}
          testID="food-map-ask"
        />
      );
    case 'blocked':
      return (
        <CommunityStateCard
          title="Location is off for Famara"
          message="Turn on location in Settings to see the neighbourhoods around you and check in at spots."
          actions={[
            state.canAskAgain
              ? { label: 'Allow location', onPress: origin.requestAccess }
              : { label: 'Open Settings', onPress: origin.openSettings },
          ]}
          testID="food-map-blocked"
        />
      );
    case 'unavailable':
      return (
        <CommunityStateCard
          title="We couldn't find your location"
          message="Check that location is on, then try again."
          alert
          actions={[{ label: 'Try again', onPress: origin.retry }]}
          testID="food-map-no-location"
        />
      );
    case 'located':
      break;
  }
  if (query.isError) {
    return (
      <CommunityStateCard
        title={
          isAreaFilling(query.error)
            ? 'This area is still being mapped'
            : "The food map didn't load"
        }
        message={
          isAreaFilling(query.error)
            ? 'Mapping a new area takes a little while the first time. Try again in a moment.'
            : errorMessageFor(query.error)
        }
        alert
        actions={[{ label: 'Try again', onPress: () => void query.refetch() }]}
        testID="food-map-error"
      />
    );
  }
  const filling = isAreaFilling(query.failureReason);
  return (
    <CommunityStateCard
      loading
      loadingLabel="Loading the food map"
      title={filling ? 'Mapping your neighbourhoods' : 'Loading the food map'}
      message={
        filling
          ? 'The first look at an area takes a few seconds.'
          : 'Getting your neighbourhoods and spots ready…'
      }
      testID="food-map-loading"
    />
  );
}

/** The map loaded but there is no spot to suggest; say why. */
function NoSpots({ view, onRetry }: { view: FoodMapView; onRetry: () => void }) {
  if (view.regions.length === 0) {
    return (
      <CommunityStateCard
        title="No neighbourhoods here yet"
        message="We couldn't find neighbourhood boundaries around you. Try again later."
        actions={[{ label: 'Try again', onPress: onRetry }]}
        testID="food-map-no-regions"
      />
    );
  }
  if (view.spotsPending) {
    return (
      <CommunityStateCard
        loading
        loadingLabel="Finding healthy spots"
        title="Finding healthy spots"
        message="Spots for your neighbourhoods show up here as they are found."
        actions={[{ label: 'Check again', onPress: onRetry }]}
        testID="food-map-spots-pending"
      />
    );
  }
  if (view.spotsUnavailable) {
    return (
      <CommunityStateCard
        title="Spot suggestions are off for now"
        message="Healthy spots can't be looked up right now. Your neighbourhoods and check-ins still show on the map."
        testID="food-map-spots-unavailable"
      />
    );
  }
  return (
    <CommunityStateCard
      title="No healthy spots found nearby"
      message="None of the places around you look healthy-leaning yet. New spots show up as places open."
      testID="food-map-no-spots"
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bottom: { position: 'absolute', left: space.lg, right: space.lg, gap: space.sm },
  credit: { alignSelf: 'flex-start' },
});
