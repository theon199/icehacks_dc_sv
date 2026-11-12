/**
 * Sync status for the UI (e.g. "3 changes waiting" or an offline badge in Settings).
 */
import { create } from 'zustand';

import type { SyncStatus } from './engine';

const initial: SyncStatus = { phase: 'stopped', pending: 0, lastSyncedAt: null, lastError: null };

interface SyncStatusState extends SyncStatus {
  set: (status: SyncStatus) => void;
  reset: () => void;
}

export const useSyncStatusStore = create<SyncStatusState>()((set) => ({
  ...initial,
  set: (status) => set(status),
  reset: () => set(initial),
}));

export const selectSyncPhase = (state: SyncStatusState) => state.phase;
export const selectPendingChanges = (state: SyncStatusState) => state.pending;
export const selectLastSyncedAt = (state: SyncStatusState) => state.lastSyncedAt;
