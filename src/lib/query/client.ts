/**
 * React Query setup: one QueryClient for the app, with retries that respect typed API errors,
 * online status from expo-network and focus from AppState.
 */
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { isApiError } from '../api/errors';

const MAX_RETRIES = 2;

/** Retry transient failures only; never retry auth, validation or rate-limit errors. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (isApiError(error)) return error.retryable;
  return true;
}

/** Exponential backoff with a cap: 1 s, 2 s, 4 s … up to 15 s. */
export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 15_000);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 15 * 60_000,
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();

export function isOnline(state: Network.NetworkState): boolean {
  // `isInternetReachable` is null while unknown; treat unknown as online to avoid false offline UI.
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * Connects React Query's online and focus managers to the device. Returns a cleanup function.
 * Call once from the root layout.
 */
export function wireQueryManagers(): () => void {
  onlineManager.setEventListener((setOnline) => {
    const subscription = Network.addNetworkStateListener((state) => setOnline(isOnline(state)));
    Network.getNetworkStateAsync()
      .then((state) => setOnline(isOnline(state)))
      .catch(() => setOnline(true));
    return () => subscription.remove();
  });

  if (Platform.OS === 'web') return () => undefined;

  const onAppStateChange = (status: AppStateStatus) => focusManager.setFocused(status === 'active');
  const appStateSubscription = AppState.addEventListener('change', onAppStateChange);
  return () => appStateSubscription.remove();
}
