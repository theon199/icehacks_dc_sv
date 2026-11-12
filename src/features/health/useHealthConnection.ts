import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  resolveHealthConnection,
  type HealthConnectionState,
  type HealthPlatform,
  type HealthRequestStatus,
} from '@/domain/health';
import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';
import { toast } from '@/ui';

import { healthCopy } from './copy';
import { healthKitSource } from './healthKit';
import { useHealthStore } from './healthStore';
import { refreshHealth, removeSyncedHealth } from './refresh';

export interface HealthConnection {
  /** `checking` until the device has been asked what it supports. */
  state: HealthConnectionState | 'checking';
  busy: boolean;
  syncEnabled: boolean;
  /** Turns Health on and shows the permission sheet if it has not been answered. */
  connect: () => Promise<void>;
  /** Turns Health off, clears local health data, and removes synced summaries. */
  disconnect: () => void;
  setSyncEnabled: (enabled: boolean) => void;
  /** Re-reads Health now, ignoring the usual interval. */
  refresh: () => Promise<void>;
}

/**
 * Makes sure the stored health data belongs to whoever is signed in before it is turned on or
 * synced, even when this hook is mounted without `useHealthRefresh` (Settings mounts the card on
 * its own).
 */
function claimForSignedIn(): void {
  const userId = useSessionStore.getState().userId;
  if (userId) useHealthStore.getState().claimFor(userId);
}

/** The permission flow behind Settings › Health. */
export function useHealthConnection(): HealthConnection {
  const enabled = useHealthStore((state) => state.enabled);
  const syncEnabled = useHealthStore((state) => state.syncEnabled);
  const [platform, setPlatform] = useState<HealthPlatform | null>(null);
  const [request, setRequest] = useState<HealthRequestStatus>('unknown');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const probe = useCallback(async () => {
    const nextPlatform = await healthKitSource.platform();
    const nextRequest =
      nextPlatform === 'available' ? await healthKitSource.requestStatus() : 'unknown';
    if (!mounted.current) return;
    setPlatform(nextPlatform);
    setRequest(nextRequest);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void probe();
    // People often change access in the Health app and come back.
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void probe();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [probe]);

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      claimForSignedIn();
      useHealthStore.getState().setEnabled(true);
      await healthKitSource.requestAccess();
      const answered = await healthKitSource.requestStatus();
      if (mounted.current) setRequest(answered);
      if (answered === 'answered') await refreshHealth({ force: true });
    } catch (error) {
      logger.warn('Apple Health connection failed', describeError(error));
      toast.show({ message: healthCopy.connection.connectFailed, tone: 'danger' });
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (useHealthStore.getState().syncEnabled) void removeSyncedHealth();
    useHealthStore.getState().setEnabled(false);
  }, []);

  const setSyncEnabled = useCallback((next: boolean) => {
    claimForSignedIn();
    // Claiming clears another account's data and turns Health off; sync then has nothing to send.
    if (next && !useHealthStore.getState().enabled) return;
    useHealthStore.getState().setSyncEnabled(next);
    if (next) void refreshHealth({ force: true });
    else void removeSyncedHealth();
  }, []);

  const refresh = useCallback(async () => {
    await refreshHealth({ force: true });
  }, []);

  const state =
    platform === null ? 'checking' : resolveHealthConnection({ platform, enabled, request });
  return { state, busy, syncEnabled, connect, disconnect, setSyncEnabled, refresh };
}
