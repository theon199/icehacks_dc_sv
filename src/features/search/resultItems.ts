/**
 * Search results as the grid renders them: one entry per recipe, each with its safety verdict for
 * the signed-in person. Search never drops a recipe for safety reasons; a recipe that does not fit
 * stays in the grid, visibly marked, with the reason spelled out for VoiceOver.
 */
import { checkRecipe, type SafetyReason, type SafetyRules } from '@/domain/safety';
import { ALLERGEN_LABELS, DIET_ADJECTIVES } from '@/domain/types';
import type { RecipeSummary, SearchPage } from '@/lib/catalog';

export interface SearchResultItem {
  readonly recipe: RecipeSummary;
  readonly eligible: boolean;
  /** Short badge text for a recipe that does not fit; null when it fits. */
  readonly badge: string | null;
  /** Every reason in full, for the accessibility label; empty when it fits. */
  readonly reasons: readonly string[];
}

/** A few words that fit on a card corner. */
export function shortReason(reason: SafetyReason): string {
  switch (reason.code) {
    case 'contains_allergen':
      return `Contains ${ALLERGEN_LABELS[reason.allergen].toLowerCase()}`;
    case 'allergen_unverified':
      return `May contain ${ALLERGEN_LABELS[reason.allergen].toLowerCase()}`;
    case 'diet_mismatch':
      return `Not ${DIET_ADJECTIVES[reason.diet]}`;
    case 'diet_unverified':
      return `May not be ${DIET_ADJECTIVES[reason.diet]}`;
    case 'preferences_unanswered':
      return 'Allergies not set';
    case 'not_in_catalog':
      return 'Not checked';
  }
}

export function toResultItem(recipe: RecipeSummary, rules: SafetyRules): SearchResultItem {
  const verdict = checkRecipe(recipe, rules);
  if (verdict.eligible) return { recipe, eligible: true, badge: null, reasons: [] };
  const [first, ...rest] = verdict.reasons;
  // checkRecipe always explains an ineligible verdict; the fallback keeps the badge visible anyway.
  const head = first ? shortReason(first) : 'Not for you';
  return {
    recipe,
    eligible: false,
    badge: rest.length > 0 ? `${head} +${rest.length}` : head,
    reasons: verdict.reasons.length > 0 ? verdict.reasons.map((r) => r.message) : [head],
  };
}

/** Builds (or recalls) the grid entry for one recipe. */
export type ResultItemFor = (recipe: RecipeSummary) => SearchResultItem;

/**
 * Remembers each recipe's entry for one set of safety rules, so loading another page or swapping
 * placeholder data reuses the entries already on screen and memoised cards skip re-rendering.
 * Keyed by the recipe object itself: the query cache hands back the same objects for pages it has
 * already loaded, and entries go away with the pages that held them.
 */
export function resultItemCache(rules: SafetyRules): ResultItemFor {
  const known = new WeakMap<RecipeSummary, SearchResultItem>();
  return (recipe) => {
    let item = known.get(recipe);
    if (!item) {
      item = toResultItem(recipe, rules);
      known.set(recipe, item);
    }
    return item;
  };
}

/**
 * Flattens the loaded pages in order. Offset paging can repeat a recipe across a page boundary;
 * the first occurrence wins so list keys stay unique.
 */
export function toResultItems(
  pages: readonly SearchPage[] | undefined,
  itemFor: ResultItemFor,
): SearchResultItem[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const items: SearchResultItem[] = [];
  for (const page of pages) {
    for (const recipe of page.items) {
      if (seen.has(recipe.id)) continue;
      seen.add(recipe.id);
      items.push(itemFor(recipe));
    }
  }
  return items;
}
