/**
 * Which account the user data on this device belongs to: a plain string written when sync starts
 * for an account and removed when that account's data is wiped. Absent while signed out.
 */
import Storage from 'expo-sqlite/kv-store';

import { storageKey } from '../storage/kv';

const OWNER_KEY = storageKey('sync.owner');

export function readDataOwner(): string | null {
  return Storage.getItemSync(OWNER_KEY);
}

export function writeDataOwner(userId: string): void {
  Storage.setItemSync(OWNER_KEY, userId);
}

export function clearDataOwner(): void {
  Storage.removeItemSync(OWNER_KEY);
}
