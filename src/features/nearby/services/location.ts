/**
 * Device location for Nearby, behind a small interface so the flow can be tested without the
 * native module. Only "while using the app" access is ever requested.
 */
import * as Location from 'expo-location';
import { Linking } from 'react-native';

import { isValidLatLng, type LatLng } from '../model/geo';
import type { PermissionSnapshot } from '../model/permission';

export interface CityMatch {
  point: LatLng;
  label: string;
}

export interface LocationService {
  getPermission(): Promise<PermissionSnapshot>;
  requestPermission(): Promise<PermissionSnapshot>;
  /** The device position, preferring a recent cached fix over waiting for a new one. */
  currentPosition(): Promise<LatLng>;
  /** First match for a city or area name; null when nothing matches. */
  findCity(query: string): Promise<CityMatch | null>;
  openSettings(): Promise<void>;
}

/** A cached fix younger than this, and at least this accurate, is good enough to search with. */
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;
const LAST_KNOWN_ACCURACY_M = 500;
const POSITION_TIMEOUT_MS = 12_000;

function snapshot(response: Location.LocationPermissionResponse): PermissionSnapshot {
  return { status: response.status, canAskAgain: response.canAskAgain };
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

const toLatLng = (coords: { latitude: number; longitude: number }): LatLng => ({
  latitude: coords.latitude,
  longitude: coords.longitude,
});

export const expoLocationService: LocationService = {
  async getPermission() {
    return snapshot(await Location.getForegroundPermissionsAsync());
  },

  async requestPermission() {
    return snapshot(await Location.requestForegroundPermissionsAsync());
  },

  async currentPosition() {
    const recent = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: LAST_KNOWN_ACCURACY_M,
    }).catch(() => null);
    if (recent && isValidLatLng(toLatLng(recent.coords))) return toLatLng(recent.coords);
    const fresh = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      POSITION_TIMEOUT_MS,
    );
    const point = toLatLng(fresh.coords);
    if (!isValidLatLng(point)) throw new Error('Location out of range');
    return point;
  },

  async findCity(query) {
    const text = query.trim();
    if (text.length < 2) return null;
    const results = await Location.geocodeAsync(text);
    const first = results.find((result) => isValidLatLng(toLatLng(result)));
    return first ? { point: toLatLng(first), label: text } : null;
  },

  async openSettings() {
    await Linking.openSettings();
  },
};
