/**
 * Drives the location flow: checks permission, explains before asking, fetches a position, and
 * falls back to a city search. The state machine itself lives in `model/permission.ts`.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  initialLocationState,
  locationReducer,
  originOf,
  type LocationState,
  type NearbyOrigin,
} from '../model/permission';
import { expoLocationService, type LocationService } from '../services/location';

export type CitySearchStatus = 'idle' | 'searching' | 'notFound' | 'failed';

export interface NearbyLocation {
  state: LocationState;
  origin: NearbyOrigin | null;
  /** Shows the system prompt (call only from the explanation step). */
  requestPermission: () => void;
  /** Switches to the manual city search. */
  chooseCity: () => void;
  /** Looks up a city and, when found, uses it as the search origin. */
  searchCity: (query: string) => Promise<void>;
  citySearch: CitySearchStatus;
  /** Goes back to the device location from a manual search. */
  useDevice: () => void;
  openSettings: () => void;
}

/** Permission answers when the native check itself fails: ask, rather than assume a refusal. */
const UNKNOWN_PERMISSION = { status: 'undetermined', canAskAgain: true } as const;

export function useNearbyLocation(service: LocationService = expoLocationService): NearbyLocation {
  const [state, dispatch] = useReducer(locationReducer, initialLocationState);
  const [citySearch, setCitySearch] = useState<CitySearchStatus>('idle');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const step = state.step;

  useEffect(() => {
    if (step !== 'checking') return;
    let live = true;
    service
      .getPermission()
      .catch(() => UNKNOWN_PERMISSION)
      .then((permission) => {
        if (live) dispatch({ type: 'checked', permission });
      });
    return () => {
      live = false;
    };
  }, [step, service]);

  useEffect(() => {
    if (step !== 'locating') return;
    let live = true;
    service.currentPosition().then(
      (point) => {
        if (live) dispatch({ type: 'located', point });
      },
      () => {
        if (live) dispatch({ type: 'locateFailed' });
      },
    );
    return () => {
      live = false;
    };
  }, [step, service]);

  // Coming back from Settings with access turned on picks up the device location by itself.
  useEffect(() => {
    if (step !== 'blocked') return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      service
        .getPermission()
        .then((permission) => {
          if (mounted.current) dispatch({ type: 'checked', permission });
        })
        .catch(() => undefined);
    });
    return () => subscription.remove();
  }, [step, service]);

  const requestPermission = useCallback(() => {
    dispatch({ type: 'request' });
    service
      .requestPermission()
      .catch(() => ({ status: 'denied', canAskAgain: false }) as const)
      .then((permission) => {
        if (mounted.current) dispatch({ type: 'answered', permission });
      });
  }, [service]);

  const chooseCity = useCallback(() => {
    setCitySearch('idle');
    dispatch({ type: 'chooseCity' });
  }, []);

  const searchCity = useCallback(
    async (query: string) => {
      setCitySearch('searching');
      try {
        const match = await service.findCity(query);
        if (!mounted.current) return;
        if (!match) {
          setCitySearch('notFound');
          return;
        }
        setCitySearch('idle');
        dispatch({ type: 'citySelected', point: match.point, label: match.label });
      } catch {
        if (mounted.current) setCitySearch('failed');
      }
    },
    [service],
  );

  const useDevice = useCallback(() => dispatch({ type: 'useDevice' }), []);

  const openSettings = useCallback(() => {
    service.openSettings().catch(() => undefined);
  }, [service]);

  return {
    state,
    origin: originOf(state),
    requestPermission,
    chooseCity,
    searchCity,
    citySearch,
    useDevice,
    openSettings,
  };
}
