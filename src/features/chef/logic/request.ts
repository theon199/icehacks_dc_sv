/**
 * Assembles one Chef request: the thread so far, the person's profile summary and the recipes
 * Chef may recommend this turn.
 */
import type { ChefRequest } from '@/lib/api/ai';
import {
  dietMask,
  type CandidateFilters,
  type RecipeSummary,
  type SearchFilters,
  type SearchPage,
} from '@/lib/catalog';
import { logger } from '@/lib/logger';
import type { ChefMessage, Preferences } from '@/stores';

import { pickCandidates, toChefCandidate } from './candidates';
import { toRequestMessages } from './conversation';
import { chefProfileFrom } from './profile';
import { searchTermsFrom } from './searchTerms';
import { safetyPrefsFrom } from '../deps';

/** How many recipes of the broad pool are read before choosing. */
export const POOL_SIZE = 300;
/** Matches kept per searched word. */
export const MATCHES_PER_TERM = 10;

export interface CatalogAccess {
  listCandidates(filters: CandidateFilters): Promise<readonly RecipeSummary[]>;
  searchRecipes(query: string, filters: SearchFilters): Promise<SearchPage>;
}

/** Interleaves lists so every searched word gets its best matches in early. */
function interleave<T>(lists: readonly (readonly T[])[]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const item = list[i];
      if (item !== undefined) out.push(item);
    }
  }
  return out;
}

/**
 * Recipes Chef may recommend for `question`, already screened for the person. Catalog failures
 * shrink the list rather than failing the question: Chef can still answer without recipes.
 */
export async function gatherCandidates(
  question: string,
  prefs: Preferences,
  catalog: CatalogAccess,
): Promise<RecipeSummary[]> {
  const safety = safetyPrefsFrom(prefs);
  // Nothing is safe before the allergen question is answered, so there is nothing to look up.
  if (safety.allergens === null || safety.diets === null) return [];
  const mask = dietMask(prefs.diets);
  const shared = { avoidAllergens: safety.allergens, ...(mask ? { dietMask: mask } : {}) };

  const terms = searchTermsFrom(question);
  const [matches, pool] = await Promise.all([
    Promise.all(
      terms.map((term) =>
        catalog
          .searchRecipes(term, shared)
          .then((page) => page.items.slice(0, MATCHES_PER_TERM))
          .catch((error: unknown) => {
            logger.warn('Chef: recipe search failed', { error: String(error) });
            return [] as RecipeSummary[];
          }),
      ),
    ),
    catalog
      .listCandidates({
        avoidAllergens: safety.allergens,
        ...(mask ? { excludeDietMask: mask } : {}),
        limit: POOL_SIZE,
      })
      .catch((error: unknown) => {
        logger.warn('Chef: candidate list failed', { error: String(error) });
        return [] as RecipeSummary[];
      }),
  ]);

  return pickCandidates(
    { matches: interleave(matches), pool },
    { prefs: safety, lovedCuisines: prefs.cuisines },
  );
}

export interface BuiltRequest {
  readonly request: ChefRequest;
  /** The offered recipes, for looking up the ids Chef names. */
  readonly offered: readonly RecipeSummary[];
}

/** The full request for a thread whose last message is the person's, or null otherwise. */
export async function buildChefRequest(
  messages: readonly ChefMessage[],
  prefs: Preferences,
  catalog: CatalogAccess,
  image?: string,
): Promise<BuiltRequest | null> {
  const turns = toRequestMessages(messages);
  if (!turns) return null;
  const question = turns[turns.length - 1]?.content ?? '';
  const offered = await gatherCandidates(question, prefs, catalog);
  return {
    request: {
      messages: turns,
      profile: chefProfileFrom(prefs),
      candidates: offered.map(toChefCandidate),
      ...(image ? { image } : {}),
    },
    offered,
  };
}
