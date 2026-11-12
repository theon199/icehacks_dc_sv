/**
 * Remembers each signed-in person's birth year on this device so the right route group shows on
 * launch, before any network call. The server stays the source of truth and replaces this hint as
 * soon as it answers. Onboarding completion and AI consent are not kept here: both come through
 * `deps.ts`.
 */
import { z } from 'zod';

import { defineKvKey, type KvKey } from '@/lib/storage/kv';

const cachedSetupSchema = z.object({
  birthYear: z.number().int().min(1900).max(2100).nullable(),
});

export type CachedSetup = z.infer<typeof cachedSetupSchema>;

function keyFor(userId: string): KvKey<CachedSetup> {
  return defineKvKey(`session.setup.${userId}`, cachedSetupSchema);
}

export function readCachedSetup(userId: string): CachedSetup {
  try {
    return keyFor(userId).getSync() ?? { birthYear: null };
  } catch {
    return { birthYear: null };
  }
}

export function writeCachedSetup(userId: string, setup: CachedSetup): void {
  try {
    keyFor(userId).setSync(setup);
  } catch {
    // Losing this cache only means the setup screens may show again; the server stays the source of truth.
  }
}

/** Removes the hint for an account that has been deleted. */
export function forgetCachedSetup(userId: string): void {
  try {
    void keyFor(userId).remove();
  } catch {
    // Nothing useful to do: a leftover hint is replaced by the server's answer on any next sign-in.
  }
}
