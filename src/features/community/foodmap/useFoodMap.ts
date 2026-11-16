/**
 * Server state for the food map: where the device is, the `food-map` answer for that spot, the
 * photos on a card, and checking in.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  CHECK_IN_MAX_REPORTED_ACCURACY_M,
  checkInAllowance,
  distanceMeters,
} from '@/domain/foodmap';
import {
  checkInAtPlace,
  checkInRejection,
  fetchFoodMap,
  fetchPlacePhoto,
  foodMapPending,
  isPlacePhotoQuotaExceeded,
  isPlacePhotoUnavailable,
  type CheckInResponse,
  type FoodMapResponse,
  type PlacePhotoResponse,
} from '@/lib/api/foodMap';
import { errorMessageFor } from '@/ui';

import { checkInRejectionMessage } from './checkInMessages';
import { distanceLabel, timeOfDayLabel } from './format';
import { expoFoodMapLocation, type DeviceFix, type FoodMapLocation } from './location';
import type { SpotView } from './model';
import { communityKeys, useViewer } from '../hooks/queryKeys';

// -------------------------------------------------------------------------------------------------
// Where the device is
// -------------------------------------------------------------------------------------------------

export type OriginState =
  | { readonly step: 'checking' }
  /** Not asked yet: explain, then ask. */
  | { readonly step: 'ask' }
  | { readonly step: 'blocked'; readonly canAskAgain: boolean }
  | { readonly step: 'locating' }
  | { readonly step: 'located'; readonly fix: DeviceFix }
  /** Allowed, but no position came back. */
  | { readonly step: 'unavailable' };

export interface FoodMapOrigin {
  readonly state: OriginState;
  readonly requestAccess: () => void;
  readonly retry: () => void;
  readonly openSettings: () => void;
}

export function useFoodMapOrigin(location: FoodMapLocation = expoFoodMapLocation): FoodMapOrigin {
  const [state, setState] = useState<OriginState>({ step: 'checking' });
  const step = state.step;

  useEffect(() => {
    if (step !== 'checking') return undefined;
    let live = true;
    location
      .access()
      .catch(() => ({ status: 'undetermined' as const }))
      .then((access) => {
        if (!live) return;
        if (access.status === 'granted') setState({ step: 'locating' });
        else if (access.status === 'undetermined') setState({ step: 'ask' });
        else setState({ step: 'blocked', canAskAgain: access.canAskAgain });
      });
    return () => {
      live = false;
    };
  }, [step, location]);

  useEffect(() => {
    if (step !== 'locating') return undefined;
    let live = true;
    location.currentFix({ precise: false }).then(
      (fix) => {
        if (live) setState({ step: 'located', fix });
      },
      () => {
        if (live) setState({ step: 'unavailable' });
      },
    );
    return () => {
      live = false;
    };
  }, [step, location]);

  // Coming back from Settings: look at the permission again.
  useEffect(() => {
    if (step !== 'blocked') return undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') setState({ step: 'checking' });
    });
    return () => subscription.remove();
  }, [step]);

  const requestAccess = useCallback(() => {
    void location
      .requestAccess()
      .catch(() => ({ status: 'denied' as const, canAskAgain: false }))
      .then((access) => {
        if (access.status === 'granted') setState({ step: 'locating' });
        else if (access.status === 'denied')
          setState({ step: 'blocked', canAskAgain: access.canAskAgain });
        else setState({ step: 'ask' });
      });
  }, [location]);

  const retry = useCallback(() => setState({ step: 'checking' }), []);
  const openSettings = useCallback(() => {
    void location.openSettings().catch(() => undefined);
  }, [location]);

  return { state, requestAccess, retry, openSettings };
}

// -------------------------------------------------------------------------------------------------
// The map
// -------------------------------------------------------------------------------------------------

/**
 * The map is asked for at about 100 m precision: enough to pick the neighbourhoods around the
 * person, and small moves keep the same cache entry.
 */
const CELL_DECIMALS = 3;
const MAP_STALE_MS = 60_000;
/** While the area is filled the first time, ask again this many times before giving up. */
const AREA_FILL_RETRIES = 8;
const SPOTS_POLL_MS = 5000;

export function roundedOrigin(fix: Pick<DeviceFix, 'lat' | 'lng'>): { lat: number; lng: number } {
  const factor = 10 ** CELL_DECIMALS;
  return {
    lat: Math.round(fix.lat * factor) / factor,
    lng: Math.round(fix.lng * factor) / factor,
  };
}

export function useFoodMapQuery(fix: DeviceFix | null) {
  const viewer = useViewer();
  const origin = fix ? roundedOrigin(fix) : null;
  const cell = origin ? `${origin.lat},${origin.lng}` : 'none';
  return useQuery<FoodMapResponse>({
    queryKey: communityKeys.foodMap(viewer, cell),
    enabled: origin !== null && viewer !== null,
    queryFn: ({ signal }) => {
      if (!origin) throw new Error('No position for the food map');
      return fetchFoodMap(origin, { signal });
    },
    staleTime: MAP_STALE_MS,
    // Spots of a new area are looked up after the regions; keep asking until they are in.
    refetchInterval: (q) =>
      q.state.data?.regions.some((r) => r.spotsStatus === 'pending') ? SPOTS_POLL_MS : false,
    retry: (count, error) => (foodMapPending(error) ? count < AREA_FILL_RETRIES : count < 1),
    retryDelay: (_count, error) => (foodMapPending(error)?.retryAfterS ?? 2) * 1000,
  });
}

/** The first fill of an area is still running (the query is waiting to ask again). */
export function isAreaFilling(failureReason: unknown): boolean {
  return foodMapPending(failureReason) !== null;
}

// -------------------------------------------------------------------------------------------------
// Photos
// -------------------------------------------------------------------------------------------------

/** Ask for a new link this long before the old one expires. */
const PHOTO_EXPIRY_MARGIN_MS = 60_000;
const PHOTO_GC_MS = 30 * 60_000;

export function usePlacePhoto(photoName: string | null, maxWidth: number) {
  const viewer = useViewer();
  return useQuery<PlacePhotoResponse>({
    queryKey: communityKeys.placePhoto(viewer, photoName ?? '', maxWidth),
    enabled: photoName !== null && viewer !== null,
    queryFn: ({ signal }) => {
      if (photoName === null) throw new Error('No photo');
      return fetchPlacePhoto({ photoName, maxWidth }, { signal });
    },
    staleTime: (query) => {
      const expiresAt = query.state.data ? Date.parse(query.state.data.expiresAt) : NaN;
      return Number.isFinite(expiresAt)
        ? Math.max(0, expiresAt - Date.now() - PHOTO_EXPIRY_MARGIN_MS)
        : 0;
    },
    gcTime: PHOTO_GC_MS,
    retry: (count, error) =>
      !isPlacePhotoUnavailable(error) && !isPlacePhotoQuotaExceeded(error) && count < 1,
  });
}

// -------------------------------------------------------------------------------------------------
// Checking in
// -------------------------------------------------------------------------------------------------

/** A check-in stopped on the device, before anything was sent; the message says why. */
export class CheckInStopped extends Error {
  constructor(
    message: string,
    readonly needsSettings = false,
  ) {
    super(message);
    this.name = 'CheckInStopped';
  }
}

export interface CheckInVariables {
  readonly spot: Pick<SpotView, 'placeId' | 'name' | 'point'>;
}

/** Why a check-in failed, in words. */
export function checkInErrorMessage(error: unknown): string {
  if (error instanceof CheckInStopped) return error.message;
  const rejection = checkInRejection(error);
  if (rejection) {
    return checkInRejectionMessage(
      rejection,
      (m) => distanceLabel(m),
      (iso) => timeOfDayLabel(iso),
    );
  }
  return errorMessageFor(error);
}

async function ensureAccess(location: FoodMapLocation): Promise<void> {
  let access = await location.access();
  if (access.status === 'undetermined') access = await location.requestAccess();
  if (access.status !== 'granted') {
    throw new CheckInStopped(
      'Allow location to check in. Famara only checks that you are at the place and never keeps your position.',
      true,
    );
  }
}

/**
 * Checks in at a spot from a fresh, precise position. A position plainly too far away is refused
 * here with the distance, without a request; the server's own check decides everything else.
 */
export function useCheckIn(location: FoodMapLocation = expoFoodMapLocation) {
  const viewer = useViewer();
  const client = useQueryClient();
  return useMutation<CheckInResponse, Error, CheckInVariables>({
    mutationFn: async ({ spot }) => {
      await ensureAccess(location);
      let fix: DeviceFix;
      try {
        fix = await location.currentFix({ precise: true });
      } catch {
        throw new CheckInStopped("Your location isn't available right now. Try again in a moment.");
      }
      const accuracyM = fix.accuracyM;
      if (accuracyM !== null && accuracyM > CHECK_IN_MAX_REPORTED_ACCURACY_M) {
        throw new CheckInStopped("Your location isn't precise enough yet. Try again in a moment.");
      }
      const distanceM = distanceMeters(fix, {
        lat: spot.point.latitude,
        lng: spot.point.longitude,
      });
      if (!checkInAllowance(distanceM, accuracyM).allowed) {
        throw new CheckInStopped(
          `You're ${distanceLabel(distanceM)} away. Check in when you're at the place.`,
        );
      }
      return checkInAtPlace({
        placeId: spot.placeId,
        lat: fix.lat,
        lng: fix.lng,
        accuracyM: accuracyM ?? 0,
      });
    },
    onSettled: () => client.invalidateQueries({ queryKey: communityKeys.foodMaps(viewer) }),
  });
}
