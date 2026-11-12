import type { IngredientDef } from '../knowledge/define.ts';
import { CUISINES } from '../knowledge/cuisines.ts';
import { ALIAS_DESCRIPTORS, SEARCH_ALIASES } from '../knowledge/searchAliases.ts';
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

type AliasTable = Readonly<Record<string, readonly string[]>>;

/**
 * Keys of words that name a food on their own: every one-word ingredient name, plural and
 * synonym, plus every one-word curated alias.
 */
export function foodWordKeys(defs: Iterable<IngredientDef>, aliases: AliasTable = SEARCH_ALIASES): Set<string> {
  const keys = new Set<string>();
  const add = (phrase: string) => {
    const words = phraseWords(phrase);
    if (words.length === 1 && words[0]) keys.add(wordKey(words[0]));
  };
  for (const def of defs) {
    add(def.name);
    if (def.plural) add(def.plural);
    def.syn.forEach(add);
  }
  for (const list of Object.values(aliases)) list.forEach(add);
  return keys;
}

const isDescriptor = (word: string): boolean => ALIAS_DESCRIPTORS.has(word) || ALIAS_DESCRIPTORS.has(wordKey(word));

/**
 * Words one curated alias adds to the index. A one-word alias is indexed as is. From a multi-word
 * alias only words that are foods on their own are kept ("coriander" from "coriander leaves",
 * "pepper" from "sweet pepper"); descriptors ("french", "plain", "half") and words that are not
 * foods by themselves are dropped, so they never match unrelated recipes.
 */
export function aliasIndexWords(alias: string, foodKeys: ReadonlySet<string>): string[] {
  const words = phraseWords(alias);
  if (words.length === 1) return words;
  return words.filter((w) => !isDescriptor(w) && foodKeys.has(wordKey(w)));
}

/** Every word curated aliases add to the index, per ingredient id. */
export function aliasIndexWordsById(defs: readonly IngredientDef[], aliases: AliasTable = SEARCH_ALIASES): Map<string, string[]> {
  const foodKeys = foodWordKeys(defs, aliases);
  const out = new Map<string, string[]>();
  for (const def of defs) {
    const words = (aliases[def.id] ?? []).flatMap((alias) => aliasIndexWords(alias, foodKeys));
    if (words.length > 0) out.set(def.id, [...new Set(words)]);
  }
  return out;
}

/** Keys of cuisine labels and the place names that identify them ("french", "thai", "greece"). */
export function cuisineWordKeys(): Set<string> {
  return new Set(CUISINES.flatMap((c) => [...phraseWords(c.label), ...c.names.flatMap(phraseWords)]).map(wordKey));
}

/** Alias index words that are a cuisine word or a known descriptor; empty when the table is clean. */
export function aliasTokenViolations(defs: readonly IngredientDef[], aliases: AliasTable = SEARCH_ALIASES): { id: string; word: string; reason: string }[] {
  const cuisineKeys = cuisineWordKeys();
  const out: { id: string; word: string; reason: string }[] = [];
  for (const [id, words] of aliasIndexWordsById(defs, aliases)) {
    for (const word of words) {
      if (cuisineKeys.has(wordKey(word))) out.push({ id, word, reason: 'is a cuisine word' });
      if (isDescriptor(word)) out.push({ id, word, reason: 'is a descriptor, not a food on its own' });
    }
  }
  return out;
}

interface IndexedIngredient {
  /** Always indexed: the head noun of the name and plural, plus the food words of curated aliases. */
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
 *   food words of the ingredient's curated aliases ({@link aliasIndexWords});
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

  constructor(defList: Iterable<IngredientDef>) {
    const defs = [...defList];
    const aliasWords = aliasIndexWordsById(defs);
    for (const def of defs) {
      const nameWords = phraseWords(def.name);
      const pluralWords = def.plural ? phraseWords(def.plural) : [];
      const heads = [nameWords.at(-1), pluralWords.at(-1)].filter((w): w is string => w !== undefined);
      const always = [...heads, ...(aliasWords.get(def.id) ?? [])];
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
