/** Text normalisation shared by the synonym index and ingredient-line matching. */

const IRREGULAR: Record<string, string> = {
  leaves: 'leaf',
  halves: 'half',
  loaves: 'loaf',
  knives: 'knife',
  chillies: 'chilli',
  chilies: 'chili',
  anchovies: 'anchovy',
  cookies: 'cookie',
  dice: 'dice',
  mice: 'mice',
  feet: 'foot',
  geese: 'goose',
  teeth: 'tooth',
};

/** Words where a trailing "s" is not a plural. */
const KEEP = new Set([
  'hummus',
  'couscous',
  'asparagus',
  'molasses',
  'swiss',
  'citrus',
  'harissa',
  'grits',
  'oats',
  'peas',
  'lentils',
  'greens',
  'brussels',
  'its',
  'this',
  'less',
  'bass',
  'cress',
  'watercress',
  'glass',
  'mass',
  'jus',
  'aus',
  'tortellinis',
  'gras',
  'ras',
  'bris',
  'bananas',
  'tapas',
  'paris',
  'chorus',
  'bolognese',
  'lees',
  'cheese',
  'mayonnaise',
  'is',
  'was',
  'has',
  'his',
  'yes',
  'gas',
  'focus',
  'octopus',
  'cactus',
  'hibiscus',
  'fungus',
  'nachos',
  'tamales',
  'calamansis',
  'fries',
]);

export function singular(word: string): string {
  const w = word;
  if (w.length <= 3) return w;
  const irregular = IRREGULAR[w];
  if (irregular) return irregular;
  if (KEEP.has(w)) {
    // Normalise a few fixed plurals so "pea"/"peas" and "oat"/"oats" meet.
    if (w === 'peas') return 'pea';
    if (w === 'oats') return 'oat';
    if (w === 'lentils') return 'lentil';
    if (w === 'greens') return 'greens';
    if (w === 'bananas') return 'banana';
    return w;
  }
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('oes')) return w.slice(0, -2);
  if (/(?:ches|shes|xes|sses|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function foldAccents(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** Lower-case, accent-free, punctuation-free tokens with simple singularisation. */
export function tokenize(text: string): string[] {
  return foldAccents(text.toLowerCase())
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(singular);
}

export function normalizeKey(text: string): string {
  return tokenize(text).join(' ');
}

/** Removes parenthesised and bracketed asides: "beans (canned, drained)" -> "beans". */
export function stripParentheticals(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) out = out.replace(/\([^()]*\)|\[[^[\]]*\]/g, ' ');
  return out.replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}
