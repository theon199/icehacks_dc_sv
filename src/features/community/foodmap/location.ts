/**
 * Device location for the food map, behind a small interface so screens can be tested without the
 * native module. Only "while using the app" access is ever asked for, and a position is used for
 * the request it was taken for: the server checks a check-in's distance and never stores it.
 */
import * as Location from 'expo-location';
import { Linking } from 'react-native';

export type LocationAccess =
  | { readonly status: 'granted' }
  | { readonly status: 'undetermined' }
  | { readonly status: 'denied'; readonly canAskAgain: boolean };

export interface DeviceFix {
  readonly lat: number;
  readonly lng: number;
  /** Metres, as the device reports it; `null` when unknown. */
  readonly accuracyM: number | null;
}

export interface FoodMapLocation {
  access(): Promise<LocationAccess>;
  requestAccess(): Promise<LocationAccess>;
  /**
   * The device position. `precise` waits for a fresh, accurate fix (a check-in); otherwise a recent
   * cached fix is good enough (framing the map).
   */
  currentFix(options: { precise: boolean }): Promise<DeviceFix>;
  openSettings(): Promise<void>;
}

const CACHED_MAX_AGE_MS = 5 * 60_000;
const CACHED_ACCURACY_M = 500;
const FIX_TIMEOUT_MS = 15_000;

function accessOf(response: Location.LocationPermissionResponse): LocationAccess {
  if (response.status === Location.PermissionStatus.GRANTED) return { status: 'granted' };
  if (response.status === Location.PermissionStatus.UNDETERMINED) return { status: 'undetermined' };
  return { status: 'denied', canAskAgain: response.canAskAgain };
}

function fixOf(position: Location.LocationObject): DeviceFix {
  const { latitude, longitude, accuracy } = position.coords;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    throw new Error('Location out of range');
  }
  return {
    lat: latitude,
    lng: longitude,
    accuracyM: accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Location timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('Location failed'));
      },
    );
  });
}

export const expoFoodMapLocation: FoodMapLocation = {
  async access() {
    return accessOf(await Location.getForegroundPermissionsAsync());
  },

  async requestAccess() {
    return accessOf(await Location.requestForegroundPermissionsAsync());
  },

  async currentFix({ precise }) {
    if (!precise) {
      const recent = await Location.getLastKnownPositionAsync({
        maxAge: CACHED_MAX_AGE_MS,
        requiredAccuracy: CACHED_ACCURACY_M,
      }).catch(() => null);
      if (recent) return fixOf(recent);
    }
    const fresh = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: precise ? Location.Accuracy.High : Location.Accuracy.Balanced,
      }),
      FIX_TIMEOUT_MS,
    );
    return fixOf(fresh);
  },

  async openSettings() {
    await Linking.openSettings();
  },
};
