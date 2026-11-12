/**
 * Saved variants are per-account user data, so their store lives with the other synced stores in
 * `src/stores/variants.ts` (registered with sync there). Feature code reaches it through
 * `deps.ts`; this module only keeps the store addressable from the feature's own tests.
 */
export { selectVariantGroups, useVariantStore, variantsSync, type VariantState } from '@/stores';
