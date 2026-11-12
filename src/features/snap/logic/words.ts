/**
 * Small text helpers for comparing what the AI saw with catalog names. Kept deliberately simple:
 * they only need to line up everyday food words ("tomatoes" with "tomato"), not parse English.
 */
import { tokenize } from '@/lib/catalog/searchQuery';

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
  'bag',
  'box',
  'can',
  'jar',
  'bottle',
  'pack',
  'carton',
]);

/** Plurals the suffix table below would get wrong, mapped straight to their singular. */
const IRREGULAR: Readonly<Record<string, string>> = {
  leaves: 'leaf',
  loaves: 'loaf',
  halves: 'half',
  knives: 'knife',
  cheeses: 'cheese',
  sauces: 'sauce',
  slices: 'slice',
  olives: 'olive',
  chives: 'chive',
  peas: 'pea',
  fries: 'fry',
  oats: 'oats',
  hummus: 'hummus',
  couscous: 'couscous',
  asparagus: 'asparagus',
  molasses: 'molasses',
  swiss: 'swiss',
};

/** Foods whose singular really ends in "-ie", so "-ies" must not become "-y". */
const IE_FOODS = new Set([
  'brownie',
  'cookie',
  'pie',
  'smoothie',
  'veggie',
  'hoagie',
  'calorie',
  'sweetie',
  'birdie',
]);

/**
 * Plural endings, longest first: the ending, what replaces it, and how many letters must remain
 * before it for the rule to apply (so short words such as "bus" or "gas" are left alone).
 */
const SUFFIX_RULES: readonly (readonly [ending: string, swap: string, minStem: number])[] = [
  ['sses', 'ss', 1],
  ['ches', 'ch', 1],
  ['shes', 'sh', 1],
  ['ies', 'y', 3],
  ['oes', 'o', 2],
  ['xes', 'x', 1],
  ['zes', 'z', 2],
  ['s', '', 3],
];

/** Singular of one lowercase word: irregular table first, then the first suffix rule that fits. */
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

/** Lowercase singular word tokens, without filler words. */
export function foodWords(text: string): string[] {
  return tokenize(text)
    .filter((word) => !FILLER.has(word))
    .map(singular);
}

/** Normalised key for a name: same food words, same key. */
export function nameKey(text: string): string {
  return foodWords(text).join(' ');
}

/**
 * How alike two names are, 0..1: the food words both share, as a fraction of all the distinct food
 * words used by either.
 */
export function wordOverlap(a: string, b: string): number {
  const first = new Set(foodWords(a));
  const second = new Set(foodWords(b));
  const everyWord = new Set([...first, ...second]);
  if (first.size === 0 || second.size === 0) return 0;
  const inBoth = [...first].filter((word) => second.has(word)).length;
  return inBoth / everyWord.size;
}

/** Capitalises the first letter, for names the AI returns in lowercase. */
export function capitalize(text: string): string {
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
