/**
 * Starting points offered when the search box is empty or a search finds nothing. Plain words that
 * match many catalog titles and ingredients, so each one reliably leads somewhere.
 */
export const STARTER_TERMS: readonly string[] = [
  'lentils',
  'chickpea',
  'salmon',
  'stir fry',
  'soup',
  'oats',
  'tofu',
  'salad',
];

/**
 * Words to drop when a multi-word search finds nothing: keeps the longest word, which is usually
 * the dish or main ingredient ("quick spicy lentil soup" → "lentil"). Null for one-word searches.
 */
export function broaderTerm(query: string): string | null {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length < 2) return null;
  return words.reduce((longest, word) => (word.length > longest.length ? word : longest));
}
