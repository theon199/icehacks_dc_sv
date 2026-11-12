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

/** Plural forms the simple rules below would get wrong. */
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
  oats: 'oats',
  hummus: 'hummus',
  couscous: 'couscous',
  asparagus: 'asparagus',
  molasses: 'molasses',
  swiss: 'swiss',
};

/** Singular form of one lowercase word, by the common English rules. */
export function singular(word: string): string {
  const irregular = IRREGULAR[word];
  if (irregular) return irregular;
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (/(ches|shes|xes|sses|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
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

/** Share of words two names have in common (Jaccard index over food words), 0..1. */
export function wordOverlap(a: string, b: string): number {
  const left = new Set(foodWords(a));
  const right = new Set(foodWords(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / (left.size + right.size - shared);
}

/** Capitalises the first letter, for names the AI returns in lowercase. */
export function capitalize(text: string): string {
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
