/**
 * Everything the pantry reads from outside its folder. Stored preferences and catalog candidates
 * reach the ranking domain through the app-wide bridges (`@/stores/domainBridge`,
 * `@/lib/catalog`), re-exported here under the pantry's names; those bridges keep safety
 * fail-closed, so anything they cannot map reads as "unanswered", never as "no restrictions".
 */
import { selectCanUseAi, selectIsAdult, useSessionStore } from '@/features/auth';
import { MAX_PANTRY_ITEMS, usePantryStore, type PantryItem } from '@/stores/pantry';

export { toDomainRecipe as toRankRecipe } from '@/lib/catalog';
export { toUserPreferences as toRankPreferences } from '@/stores/domainBridge';

/**
 * Whether the pantry can offer Snap. Its result screen is an AI feature, open only to adults who
 * agreed to the AI terms: an adult who has not agreed is asked first, and anyone younger is not
 * offered Snap at all.
 */
export type SnapAccess = 'open' | 'needsConsent' | 'unavailable';

export function useSnapAccess(): SnapAccess {
  return useSessionStore((state) => {
    if (!selectIsAdult(state)) return 'unavailable';
    return selectCanUseAi(state) ? 'open' : 'needsConsent';
  });
}

/**
 * Puts a just-removed item back exactly as it was, same id and added date, so undoing a removal
 * syncs as that item coming back rather than as a new one. The pantry store has no restore action,
 * so this writes the record directly; a full pantry or an id already in use leaves it unchanged.
 */
export function restorePantryItem(item: PantryItem): void {
  usePantryStore.setState((state) => {
    if (item.id in state.items || Object.keys(state.items).length >= MAX_PANTRY_ITEMS) return state;
    return { items: { ...state.items, [item.id]: item } };
  });
}
