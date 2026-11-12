/**
 * Places near the search origin for a dish, cached per (dish, location bucket).
 *
 * Each uncached search spends part of the person's daily allowance and the app's search budget,
 * so results stay fresh for a while and are not refetched on focus. Moving within the same ~1 km
 * cell reuses them; distances are recomputed on the device for the current origin.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchNearbyPlaces, type NearbyResponse } from '@/lib/api/commerce';
import { deviceLocale } from '@/lib/format';

import type { Tally } from '../model/confirmations';
import type { NearbyDish } from '../model/dish';
import { distanceUnitFor, locationBucket } from '../model/geo';
import type { NearbyOrigin } from '../model/permission';
import { toPlaceView, type PlaceView } from '../model/placeView';

export const PLACES_STALE_MS = 20 * 60_000;
const PLACES_GC_MS = 60 * 60_000;
/** How far around the origin a search looks. */
export const SEARCH_RADIUS_M = 5000;
const RESULT_LIMIT = 10;

export const nearbyKeys = {
  all: ['nearby'] as const,
  /** Every cached search for a dish, whatever the bucket. */
  placesFor: (dishKey: string) => ['nearby', 'places', dishKey] as const,
  places: (dishKey: string, bucket: string) => ['nearby', 'places', dishKey, bucket] as const,
  tips: (dishKey: string, bucket: string, placeIds: string, profile: string) =>
    ['nearby', 'tips', dishKey, bucket, placeIds, profile] as const,
};

export type NearbyResultKind = 'places' | 'empty' | 'notConfigured' | 'budget';

export interface NearbyPlacesResult {
  kind: NearbyResultKind;
  places: PlaceView[];
  bucket: string | null;
}

export function resultKind(response: NearbyResponse): NearbyResultKind {
  if (!response.configured) return 'notConfigured';
  if (response.notice === 'budget' && response.places.length === 0) return 'budget';
  return response.places.length === 0 ? 'empty' : 'places';
}

export function useNearbyPlaces(dish: NearbyDish | null, origin: NearbyOrigin | null) {
  const bucket = origin ? locationBucket(origin.point) : null;
  const query = useQuery({
    queryKey: nearbyKeys.places(dish?.key ?? '', bucket ?? ''),
    enabled: dish !== null && origin !== null,
    staleTime: PLACES_STALE_MS,
    gcTime: PLACES_GC_MS,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => {
      if (!dish || !origin) throw new Error('Nearby search needs a dish and a location');
      return fetchNearbyPlaces(
        {
          dish: dish.name,
          dishKey: dish.key,
          lat: origin.point.latitude,
          lng: origin.point.longitude,
          radiusM: SEARCH_RADIUS_M,
          limit: RESULT_LIMIT,
        },
        { signal },
      );
    },
  });

  const point = origin?.point ?? null;
  const result = useMemo<NearbyPlacesResult | null>(() => {
    if (!query.data) return null;
    const unit = distanceUnitFor(deviceLocale());
    return {
      kind: resultKind(query.data),
      places: query.data.places.map((place) => toPlaceView(place, point, unit)),
      bucket,
    };
  }, [query.data, point, bucket]);

  // Only the fields the screen reads, so react-query re-renders for changes to those alone.
  const { isError, error, refetch } = query;
  return { result, bucket, isError, error, refetch };
}

/** Writes a place's new tally into every cached search for the dish. */
export function setPlaceTally(
  client: QueryClient,
  dishKey: string,
  placeId: string,
  tally: Tally,
): void {
  client.setQueriesData<NearbyResponse>({ queryKey: nearbyKeys.placesFor(dishKey) }, (data) => {
    if (!data) return data;
    let changed = false;
    const places = data.places.map((place) => {
      if (place.id !== placeId) return place;
      changed = true;
      return { ...place, ...tally };
    });
    return changed ? { ...data, places } : data;
  });
}

/** The cached tally for a place, from whichever search holds it. */
export function getPlaceTally(client: QueryClient, dishKey: string, placeId: string): Tally | null {
  for (const [, data] of client.getQueriesData<NearbyResponse>({
    queryKey: nearbyKeys.placesFor(dishKey),
  })) {
    const place = data?.places.find((p) => p.id === placeId);
    if (place) {
      return { yesCount: place.yesCount, noCount: place.noCount, myAnswer: place.myAnswer };
    }
  }
  return null;
}
