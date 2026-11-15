/**
 * Word helpers for lining up the ingredient names in a person's own recipe with catalog names.
 * They only need to line up everyday food words ("tomatoes" with "tomato"), not parse English.
 */

/** Words that say nothing about which food it is. */
const FILLER = new Set([
  'a',
  'an',
  'and',
  'the',
  'of',
  'with',
  'in',
  'on',
  'style',
  'fresh',
  'homemade',
  'some',
]);

/** Plurals the suffix rules below would get wrong, mapped straight to their singular. */
const IRREGULAR: Readonly<Record<string, string>> = {
  leaves: 'leaf',
  loaves: 'loaf',
  halves: 'half',
  cheeses: 'cheese',
  sauces: 'sauce',
  slices: 'slice',
  olives: 'olive',
  chives: 'chive',
  cloves: 'clove',
  peas: 'pea',
  oats: 'oats',
  hummus: 'hummus',
  couscous: 'couscous',
  asparagus: 'asparagus',
  molasses: 'molasses',
  swiss: 'swiss',
  greens: 'greens',
};

/** Foods whose singular really ends in "-ie", so "-ies" must not become "-y". */
const IE_FOODS = new Set(['brownie', 'cookie', 'pie', 'smoothie', 'veggie']);

/** Plural endings, longest first: the ending, its replacement, and the shortest stem it needs. */
const SUFFIX_RULES: readonly (readonly [ending: string, swap: string, minStem: number])[] = [
  ['sses', 'ss', 1],
  ['ches', 'ch', 1],
  ['shes', 'sh', 1],
  ['ies', 'y', 3],
  ['oes', 'o', 2],
  ['xes', 'x', 1],
  ['s', '', 3],
];

/** Lowercases, strips accents and splits into letter-and-digit tokens. */
export function tokenize(text: string): string[] {
  const folded = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
  return folded.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * True when the text holds a pictograph or symbol that `tokenize` drops (🥜, 🥛, ™). Such a mark
 * may stand for a food, so it can never be explained away.
 */
export function hasSymbols(text: string): boolean {
  return /[\p{Extended_Pictographic}\p{So}]/u.test(text);
}

/** Singular of one lowercase word. */
export function singular(word: string): string {
  const known = IRREGULAR[word];
  if (known !== undefined) return known;
  if (word.endsWith('ies') && IE_FOODS.has(word.slice(0, -1))) return word.slice(0, -1);
  if (word.endsWith('ss') || word.endsWith('us')) return word;
  const rule = SUFFIX_RULES.find(
    ([ending, , minStem]) => word.endsWith(ending) && word.length - ending.length >= minStem,
  );
  if (!rule) return word;
  const [ending, swap] = rule;
  return word.slice(0, word.length - ending.length) + swap;
}

/** Lowercase singular food words, without filler words. */
export function foodWords(text: string): string[] {
  return tokenize(text)
    .filter((word) => !FILLER.has(word))
    .map(singular);
}

/** Normalised key for a name: the same food words give the same key. */
export function nameKey(text: string): string {
  return foodWords(text).join(' ');
}
