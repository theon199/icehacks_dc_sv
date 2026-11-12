/**
 * AI ordering tips for a dish and the places on the map. Tips are fetched only when the person
 * asks (each request uses part of a daily allowance) and kept for the session.
 */
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { aiApi, allergenIdSchema, type AllergenId, type NearbyChatRequest } from '@/lib/api/ai';
import { usePreferencesStore } from '@/stores';

import { nearbyKeys } from './useNearbyPlaces';
import type { NearbyDish } from '../model/dish';
import type { PlaceView } from '../model/placeView';

const MAX_PLACES = 20;
const TIPS_GC_MS = 30 * 60_000;

/** Only values the function accepts as slugs reach it. */
const SLUG = /^[a-z][a-z0-9_]{0,39}$/;

export interface TipsProfile {
  goals: readonly string[];
  diets: readonly string[];
  allergens: readonly string[];
}

/** Builds the request body, trimming every field to what the function accepts. */
export function buildTipsRequest(
  dish: NearbyDish,
  places: readonly PlaceView[],
  profile: TipsProfile,
): NearbyChatRequest {
  const allergens = profile.allergens.filter(
    (id): id is AllergenId => allergenIdSchema.safeParse(id).success,
  );
  return {
    dish: {
      name: dish.name.slice(0, 80),
      ...(dish.cuisine ? { cuisine: dish.cuisine.replace(/_/g, ' ').slice(0, 40) } : {}),
    },
    places: places.slice(0, MAX_PLACES).map((place) => ({
      name: place.name.slice(0, 100),
      cuisine: place.kind ? place.kind.slice(0, 60) : null,
      rating: place.rating === null ? null : Number(place.rating),
    })),
    goals: profile.goals.filter((g) => SLUG.test(g)).slice(0, 10),
    diet: profile.diets.filter((d) => SLUG.test(d)).slice(0, 10),
    allergens: [...new Set(allergens)].slice(0, 10),
  };
}

/** Order-independent summary of the preferences that shape tips, for the query key. */
export function tipsProfileKey(profile: TipsProfile): string {
  const part = (values: readonly string[]) => [...values].sort().join(',');
  return [part(profile.goals), part(profile.diets), part(profile.allergens)].join('|');
}

export function useOrderingTips(
  dish: NearbyDish | null,
  bucket: string | null,
  places: readonly PlaceView[],
) {
  const goals = usePreferencesStore((state) => state.prefs.goals);
  const diets = usePreferencesStore((state) => state.prefs.diets);
  const allergens = usePreferencesStore((state) => state.prefs.allergens);
  // Tips are written for these preferences, so changing them (adding an allergen, say) must not
  // show tips generated without it.
  const profileKey = useMemo(
    () => tipsProfileKey({ goals, diets, allergens }),
    [goals, diets, allergens],
  );
  // The profile the person asked for tips with. Tips are never fetched without a tap, so a later
  // preference change waits for the next request instead of spending the allowance by itself.
  const [requestedFor, setRequestedFor] = useState<string | null>(null);

  const placeIds = useMemo(
    () =>
      places
        .slice(0, MAX_PLACES)
        .map((p) => p.id)
        .join(','),
    [places],
  );

  const query = useQuery({
    queryKey: nearbyKeys.tips(dish?.key ?? '', bucket ?? '', placeIds, profileKey),
    enabled: requestedFor === profileKey && dish !== null && bucket !== null,
    staleTime: Infinity,
    gcTime: TIPS_GC_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => {
      if (!dish) throw new Error('Ordering tips need a dish');
      return aiApi.nearbyTips(buildTipsRequest(dish, places, { goals, diets, allergens }), {
        signal,
      });
    },
  });

  const { refetch } = query;
  const request = useCallback(() => {
    if (requestedFor === profileKey) void refetch();
    else setRequestedFor(profileKey);
  }, [requestedFor, profileKey, refetch]);

  return {
    tips: query.data?.tips ?? null,
    remaining: query.data?.quota.remaining ?? null,
    loading: query.isFetching,
    error: query.error,
    request,
  };
}
