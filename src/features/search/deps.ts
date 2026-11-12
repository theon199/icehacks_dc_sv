/**
 * Everything Search needs from other features and from the user stores, in one place. When a
 * neighbour's public surface changes, only this file follows it.
 */
import { useMemo } from 'react';

import { compileSafetyRules, type SafetyPrefs, type SafetyRules } from '@/domain/safety';
import { selectCanUseAi, selectIsAdult, useSessionStore } from '@/features/auth';
import { usePreferencesStore, type Preferences } from '@/stores/preferences';

/**
 * The Chef chat, shown under the Chef segment. It carries its own AI gate (18+ with AI features
 * turned on), so Search adds no second check in front of it.
 */
export { ChefScreen as ChefChat } from '@/features/chef';

/** Account that owns the recent searches on this device. */
export function useSearchOwnerId(): string | null {
  return useSessionStore((state) => state.userId);
}

/**
 * Calls `onChange` whenever a different account (or nobody) becomes the signed-in owner. Returns
 * the unsubscribe function.
 */
export function watchSearchOwner(onChange: (ownerId: string | null) => void): () => void {
  return useSessionStore.subscribe((state, previous) => {
    if (state.userId !== previous.userId) onChange(state.userId);
  });
}

export type AiAccess = 'allowed' | 'needs_consent' | 'too_young';

/** Whether the Chef segment may show the chat, and if not, what the person can do about it. */
export function useAiAccess(): AiAccess {
  const canUse = useSessionStore((state) => selectCanUseAi(state));
  const adult = useSessionStore((state) => selectIsAdult(state));
  if (canUse) return 'allowed';
  return adult ? 'needs_consent' : 'too_young';
}

/**
 * Stored preferences in the shape the safety module reads. Until the allergen question has been
 * answered (an explicit "none" counts) both answers are reported as missing, so no recipe is
 * treated as safe.
 */
export function toSafetyPrefs(
  prefs: Pick<Preferences, 'allergens' | 'diets' | 'allergensAnswered'>,
): SafetyPrefs {
  if (!prefs.allergensAnswered) return { allergens: null, diets: null };
  return { allergens: prefs.allergens, diets: prefs.diets };
}

/** Cuisines the person said they love, most loved first. */
export function useLovedCuisines(): readonly string[] {
  return usePreferencesStore((state) => state.prefs.cuisines);
}

/** The signed-in person's compiled safety rules; recompiled only when their answers change. */
export function useSafetyRules(): SafetyRules {
  const allergens = usePreferencesStore((state) => state.prefs.allergens);
  const diets = usePreferencesStore((state) => state.prefs.diets);
  const allergensAnswered = usePreferencesStore((state) => state.prefs.allergensAnswered);
  return useMemo(
    () => compileSafetyRules(toSafetyPrefs({ allergens, diets, allergensAnswered })),
    [allergens, diets, allergensAnswered],
  );
}
