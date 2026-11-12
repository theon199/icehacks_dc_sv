/**
 * Remembers each signed-in person's setup progress (birth year, onboarding, AI consent) on this device so
 * the right route group shows immediately on launch, before any network call.
 */
import { z } from 'zod';

import { defineKvKey, type KvKey } from '@/lib/storage/kv';

const cachedSetupSchema = z.object({
  birthYear: z.number().int().min(1900).max(2100).nullable(),
  onboardingComplete: z.boolean(),
  // Older cache entries predate this field; they read as "not yet agreed".
  aiConsent: z.boolean().default(false),
});

export type CachedSetup = z.infer<typeof cachedSetupSchema>;

const emptySetup: CachedSetup = { birthYear: null, onboardingComplete: false, aiConsent: false };

function keyFor(userId: string): KvKey<CachedSetup> {
  return defineKvKey(`session.setup.${userId}`, cachedSetupSchema);
}

export function readCachedSetup(userId: string): CachedSetup {
  try {
    return keyFor(userId).getSync() ?? { ...emptySetup };
  } catch {
    return { ...emptySetup };
  }
}

export function writeCachedSetup(userId: string, setup: CachedSetup): void {
  try {
    keyFor(userId).setSync(setup);
  } catch {
    // Losing this cache only means the setup screens may show again; the server stays the source of truth.
  }
}
