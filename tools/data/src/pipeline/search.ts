import type { IngredientDef } from '../knowledge/define.ts';
import { SEARCH_ALIASES } from '../knowledge/searchAliases.ts';
import { foldAccents, singular, stripParentheticals } from '../match/normalize.ts';

const STOP_WORDS = new Set(['or', 'and', 'of', 'with', 'for', 'the', 'to', 'in', 'on']);

/** Lower-case, accent-free words of a phrase (single letters and joining words dropped). */
function phraseWords(text: string): string[] {
  return foldAccents(text.toLowerCase())
    .replace(/['’`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

const wordKey = (word: string): string => singular(word);

interface IndexedIngredient {
  /** Always indexed: the head noun of the name and plural, plus curated aliases. */
  always: string[];
  alwaysKeys: Set<string>;
  /** Other words of the canonical name ("vegetable" in "vegetable oil"): indexed when the line uses them. */
  modifierKeys: Set<string>;
  synonymKeys: Set<string>;
}

/**
 * Builds the words each recipe is indexed under for ingredient search.
 *
 * For every matched line the index holds:
 * - the head noun of the ingredient's canonical name and plural ("oil" for vegetable oil) and the
 *   ingredient's curated aliases ({@link SEARCH_ALIASES});
 * - other canonical-name words only when the line uses them ("vegetable" for "vegetable oil",
 *   not for "sunflower oil");
 * - words of the line's own wording that belong to one of the ingredient's synonyms ("penne"
 *   from "300g penne"), unless the word is itself another ingredient's one-word name ("beef" in
 *   "beef tomatoes").
 *
 * Synonyms the line does not use are never indexed, so a recipe with penne is not found by
 * "rigatoni", and a recipe with tomatoes is not found by "beef".
 */
export class SearchIndexer {
  private readonly entries = new Map<string, IndexedIngredient>();
  /** Word key -> ids of ingredients whose whole canonical name is that one word. */
  private readonly oneWordNames = new Map<string, Set<string>>();

  constructor(defs: Iterable<IngredientDef>) {
    for (const def of defs) {
      const nameWords = phraseWords(def.name);
      const pluralWords = def.plural ? phraseWords(def.plural) : [];
      const heads = [nameWords.at(-1), pluralWords.at(-1)].filter((w): w is string => w !== undefined);
      const always = [...heads, ...(SEARCH_ALIASES[def.id] ?? []).flatMap(phraseWords)];
      const alwaysKeys = new Set(always.map(wordKey));
      const modifierKeys = new Set([...nameWords, ...pluralWords].map(wordKey).filter((k) => !alwaysKeys.has(k)));
      const synonymKeys = new Set(def.syn.flatMap(phraseWords).map(wordKey));
      this.entries.set(def.id, { always, alwaysKeys, modifierKeys, synonymKeys });
      if (nameWords.length === 1 && nameWords[0]) {
        const key = wordKey(nameWords[0]);
        let ids = this.oneWordNames.get(key);
        if (!ids) this.oneWordNames.set(key, (ids = new Set()));
        ids.add(def.id);
      }
    }
  }

  /** Index words contributed by one matched line. */
  lineWords(def: IngredientDef, lineName: string): string[] {
    const entry = this.entries.get(def.id);
    if (!entry) return phraseWords(def.name);
    const out = [...entry.always];
    for (const word of phraseWords(stripParentheticals(lineName))) {
      const key = wordKey(word);
      if (entry.alwaysKeys.has(key)) continue;
      if (entry.modifierKeys.has(key)) {
        out.push(word);
        continue;
      }
      if (!entry.synonymKeys.has(key)) continue;
      const owners = this.oneWordNames.get(key);
      if (owners && [...owners].some((id) => id !== def.id)) continue;
      out.push(word);
    }
    return out;
  }
}

/** Unique words in first-seen order, joined for the FTS `ingredients` column. */
export function joinSearchWords(words: Iterable<string>): string {
  return [...new Set(words)].join(' ');
}
