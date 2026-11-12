/**
 * Lines up item names the AI read from a photo with catalog ingredients, so pantry items carry an
 * ingredient id (and with it a shelf, allergens and recipe matching).
 *
 * Matching is cautious: a catalog ingredient is accepted only when it names the same food, or the
 * same food without some of the descriptive words ("red", "frozen") the item was given. "Peanut butter" never becomes "butter", and
 * "sweet potato" never becomes "potato"; an item without a safe match is kept as free text.
 */
import { foodWords, nameKey } from './words';

export interface MatchableIngredient {
  id: string;
  name: string;
  plural: string | null;
}

/** Words that describe a food without changing what it is. */
const MODIFIERS = new Set([
  'red',
  'green',
  'yellow',
  'orange',
  'white',
  'brown',
  'purple',
  'black',
  'large',
  'small',
  'medium',
  'baby',
  'mini',
  'cherry',
  'grape',
  'roma',
  'organic',
  'frozen',
  'dried',
  'dry',
  'raw',
  'cooked',
  'sliced',
  'chopped',
  'diced',
  'whole',
  'boneless',
  'skinless',
  'ripe',
  'plain',
  'unsalted',
  'salted',
  'canned',
  'loose',
  'leaf',
]);

/** Phrases to look up, most specific first: the full name, then its main (last) food word. */
export function lookupPhrases(name: string): string[] {
  const words = foodWords(name);
  if (words.length === 0) return [];
  const phrases = [words.join(' ')];
  const head = words[words.length - 1] as string;
  if (words.length > 1) phrases.push(head);
  return phrases;
}

/**
 * True when the catalog name is the same food as the query. The query may lose any of its own
 * descriptive words ("red onion" can be "onion"). The catalog name may only bring in descriptive
 * words when the query had none: a plain "rice" can be "white rice", but "brown rice" never becomes
 * "white rice" and "black beans" never becomes "white beans".
 */
function differsOnlyByModifiers(query: readonly string[], candidate: readonly string[]): boolean {
  const asked = new Set(query);
  const offered = new Set(candidate);
  const askedPlain = query.every((word) => !MODIFIERS.has(word));
  let common = 0;
  for (const word of offered) {
    if (asked.has(word)) common++;
    else if (!askedPlain || !MODIFIERS.has(word)) return false;
  }
  for (const word of asked) if (!offered.has(word) && !MODIFIERS.has(word)) return false;
  return common > 0;
}

/** Whether the ingredient names the same food as `name` (allowing descriptive words). */
export function isPlausibleMatch(name: string, ingredient: MatchableIngredient): boolean {
  const query = foodWords(name);
  if (query.length === 0) return false;
  const names = [ingredient.name, ingredient.plural, ingredient.id.replace(/_/g, ' ')];
  return names.some((candidate) => {
    if (!candidate) return false;
    return differsOnlyByModifiers(query, foodWords(candidate));
  });
}

/** Best plausible catalog ingredient for one name, or null. */
export async function matchIngredient<T extends MatchableIngredient>(
  name: string,
  search: (text: string) => Promise<readonly T[]>,
): Promise<T | null> {
  for (const phrase of lookupPhrases(name)) {
    const results = await search(phrase);
    const match = results.find((ingredient) => isPlausibleMatch(name, ingredient));
    if (match) return match;
  }
  return null;
}

/**
 * Matches many names at once. The result is keyed by `nameKey`, so "Tomatoes" and "tomato" share
 * one lookup; names with no food words are left out.
 */
export async function matchIngredients<T extends MatchableIngredient>(
  names: readonly string[],
  search: (text: string) => Promise<readonly T[]>,
): Promise<ReadonlyMap<string, T | null>> {
  const byKey = new Map<string, string>();
  for (const name of names) {
    const key = nameKey(name);
    if (key && !byKey.has(key)) byKey.set(key, name);
  }
  const entries = await Promise.all(
    [...byKey].map(async ([key, name]) => [key, await matchIngredient(name, search)] as const),
  );
  return new Map(entries);
}
