/**
 * A random id for this installation, used as the tie-breaker in sync versions. It lives in the
 * app's own storage (not the Keychain), so a reinstall is a new device.
 */
import { z } from 'zod';

import { newId } from '../id';
import { defineKvKey } from '../storage/kv';

const deviceIdKey = defineKvKey('sync.deviceId', z.string().min(8).max(64));

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;
  let id = deviceIdKey.getSync();
  if (!id) {
    id = newId();
    deviceIdKey.setSync(id);
  }
  cached = id;
  return id;
}

/** Test hook. */
export function resetDeviceIdForTests(): void {
  cached = null;
}
