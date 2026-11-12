/**
 * Remembers each signed-in person's setup progress (birth year, onboarding done) on this device so
 * the right route group shows immediately on launch, before any network call.
 */
import { z } from 'zod';

import { defineKvKey, type KvKey } from '@/lib/storage/kv';

const cachedSetupSchema = z.object({
  birthYear: z.number().int().min(1900).max(2100).nullable(),
  onboardingComplete: z.boolean(),
});

export type CachedSetup = z.infer<typeof cachedSetupSchema>;

function keyFor(userId: string): KvKey<CachedSetup> {
  return defineKvKey(`session.setup.${userId}`, cachedSetupSchema);
}

export function readCachedSetup(userId: string): CachedSetup {
  try {
    return keyFor(userId).getSync() ?? { birthYear: null, onboardingComplete: false };
  } catch {
    return { birthYear: null, onboardingComplete: false };
  }
}

export function writeCachedSetup(userId: string, setup: CachedSetup): void {
  try {
    keyFor(userId).setSync(setup);
  } catch {
    // Losing this cache only means the setup screens may show again; the server stays the source of truth.
  }
}
