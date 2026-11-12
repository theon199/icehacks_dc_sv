/**
 * Recent search terms. Device-local by design: they help the person pick up where they left off on
 * this phone and are never sent anywhere. The list belongs to one account; when someone else signs
 * in on the device, the previous person's terms are neither shown nor kept.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { tokenize } from '@/lib/catalog';
import { versionedPersist } from '@/stores/persistence';

/** Most terms remembered. */
export const RECENT_SEARCH_LIMIT = 8;
/** Shorter input is still typing, not a search worth remembering. */
const MIN_TERM_LENGTH = 2;
const MAX_TERM_LENGTH = 80;

const NO_TERMS: readonly string[] = Object.freeze([]);

/** Display form of a term (trimmed, single spaces), or null when it is not worth keeping. */
export function normalizeTerm(raw: string): string | null {
  const term = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TERM_LENGTH).trim();
  if (term.length < MIN_TERM_LENGTH) return null;
  return tokenize(term).length > 0 ? term : null;
}

/** Identity used to spot repeats: "Dal  Makhani" and "dal makhani" are the same search. */
const termKey = (term: string) => tokenize(term).join(' ');

/** Puts `raw` first, dropping an earlier copy and anything past the limit. */
export function addRecentTerm(
  terms: readonly string[],
  raw: string,
  limit = RECENT_SEARCH_LIMIT,
): readonly string[] {
  const term = normalizeTerm(raw);
  if (!term) return terms;
  const key = termKey(term);
  if (terms[0] === term) return terms;
  return [term, ...terms.filter((existing) => termKey(existing) !== key)].slice(0, limit);
}

export function removeRecentTerm(terms: readonly string[], term: string): readonly string[] {
  const key = termKey(term);
  const next = terms.filter((existing) => termKey(existing) !== key);
  return next.length === terms.length ? terms : next;
}

interface RecentSearchesState {
  /** Account the terms belong to. */
  ownerId: string | null;
  terms: readonly string[];
  record: (ownerId: string, term: string) => void;
  remove: (ownerId: string, term: string) => void;
  clear: () => void;
}

const persistedSchema = z.object({
  ownerId: z.string().min(1).nullable(),
  terms: z.array(z.string().min(1).max(MAX_TERM_LENGTH)).max(RECENT_SEARCH_LIMIT),
});

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set, get) => ({
      ownerId: null,
      terms: NO_TERMS,
      record: (ownerId, term) => {
        const current = get().ownerId === ownerId ? get().terms : NO_TERMS;
        const terms = addRecentTerm(current, term);
        if (terms !== get().terms || ownerId !== get().ownerId) set({ ownerId, terms });
      },
      remove: (ownerId, term) => {
        if (get().ownerId !== ownerId) return;
        const terms = removeRecentTerm(get().terms, term);
        if (terms !== get().terms) set({ terms });
      },
      clear: () => set({ terms: NO_TERMS }),
    }),
    versionedPersist({
      name: 'search.recent',
      version: 1,
      schema: persistedSchema,
      partialize: (state) => ({ ownerId: state.ownerId, terms: [...state.terms] }),
    }),
  ),
);

/** The signed-in person's recent terms, newest first; empty for anyone else. */
export function useRecentSearches(ownerId: string | null): readonly string[] {
  return useRecentSearchesStore((state) =>
    ownerId != null && state.ownerId === ownerId ? state.terms : NO_TERMS,
  );
}
