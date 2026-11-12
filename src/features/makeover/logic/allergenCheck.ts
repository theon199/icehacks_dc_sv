/**
 * Local allergen re-check for AI-adapted recipes. The makeover function already refuses answers
 * that name a declared allergen; this check runs again on the device before anything is shown as
 * savable, because AI output is never trusted on its own.
 *
 * It is deliberately cautious: it looks for ingredient words that usually carry an allergen
 * ("parmesan" for milk, "soy sauce" for wheat and soy, "flour" for wheat), handles plurals and
 * "-ed" forms, ignores a short list of look-alikes ("coconut milk", "peanut butter" for milk,
 * "water chestnut"), and lets an explicit qualifier ("dairy-free yogurt", "gluten-free pasta")
 * clear the next few words for the allergen it names. A qualifier never clears a word that is
 * the allergen itself ("soy-free tofu" is still soy). A clean result is not a safety guarantee.
 */
import type { AllergenId } from '@/domain/types/allergens';

export interface AllergenHit {
  readonly allergen: AllergenId;
  /** The words that matched, lowercased and without accents. */
  readonly found: string;
  /** Where they were found, e.g. "Ingredient 3". */
  readonly where: string;
}

export interface CheckedText {
  readonly where: string;
  readonly text: string;
}

const WHEAT_TERMS = [
  'wheat',
  'flour',
  'bread',
  'breadcrumb',
  'panko',
  'pasta',
  'spaghetti',
  'linguine',
  'fettuccine',
  'penne',
  'macaroni',
  'lasagna',
  'lasagne',
  'orzo',
  'noodle',
  'udon',
  'ramen',
  'couscous',
  'bulgur',
  'semolina',
  'durum',
  'farro',
  'spelt',
  'seitan',
  'tortilla',
  'pita',
  'naan',
  'chapati',
  'roti',
  'cracker',
  'crouton',
  'biscuit',
  'pastry',
  'dumpling',
  'wonton',
  'bun',
  'bagel',
  'croissant',
  'baguette',
  'brioche',
  'soy sauce',
  'shoyu',
];

/** Words that usually mean the allergen is present. */
const TERMS: Readonly<Record<AllergenId, readonly string[]>> = {
  milk: [
    'milk',
    'butter',
    'buttermilk',
    'cream',
    'creme fraiche',
    'cheese',
    'parmesan',
    'mozzarella',
    'cheddar',
    'feta',
    'ricotta',
    'paneer',
    'halloumi',
    'mascarpone',
    'gouda',
    'brie',
    'gruyere',
    'labneh',
    'ghee',
    'yogurt',
    'yoghurt',
    'curd',
    'whey',
    'casein',
    'kefir',
    'custard',
    'dairy',
    'lactose',
  ],
  egg: ['egg', 'yolk', 'egg white', 'mayonnaise', 'mayo', 'meringue', 'aioli'],
  fish: [
    'fish',
    'salmon',
    'tuna',
    'cod',
    'anchovy',
    'sardine',
    'mackerel',
    'tilapia',
    'trout',
    'halibut',
    'haddock',
    'snapper',
    'sea bass',
    'pollock',
    'catfish',
    'bonito',
    'fish sauce',
    'worcestershire',
  ],
  shellfish: [
    'shellfish',
    'shrimp',
    'prawn',
    'crab',
    'lobster',
    'crawfish',
    'crayfish',
    'scallop',
    'clam',
    'mussel',
    'oyster',
    'squid',
    'calamari',
    'octopus',
    'langoustine',
  ],
  tree_nut: [
    'nut',
    'almond',
    'cashew',
    'walnut',
    'pecan',
    'pistachio',
    'hazelnut',
    'macadamia',
    'brazil nut',
    'pine nut',
    'chestnut',
    'praline',
    'marzipan',
    'pesto',
    'frangipane',
  ],
  peanut: ['peanut', 'groundnut', 'satay'],
  wheat: WHEAT_TERMS,
  soy: ['soy', 'soya', 'soybean', 'tofu', 'tempeh', 'edamame', 'miso', 'tamari', 'shoyu'],
  sesame: ['sesame', 'tahini', 'gomasio', "za'atar", 'zaatar', 'halva', 'halvah', 'benne'],
  gluten: [...WHEAT_TERMS, 'gluten', 'barley', 'rye', 'malt', 'oat', 'beer'],
};

/** Words a qualifier can never clear, because they are the allergen itself. */
const INHERENT: Readonly<Record<AllergenId, readonly string[]>> = {
  milk: ['milk', 'dairy', 'lactose', 'whey', 'casein'],
  egg: ['egg', 'yolk', 'egg white'],
  fish: ['fish', 'fish sauce'],
  shellfish: ['shellfish'],
  tree_nut: [
    'nut',
    'almond',
    'cashew',
    'walnut',
    'pecan',
    'pistachio',
    'hazelnut',
    'macadamia',
    'brazil nut',
    'pine nut',
    'chestnut',
  ],
  peanut: ['peanut', 'groundnut'],
  wheat: ['wheat'],
  soy: ['soy', 'soya', 'soybean', 'tofu', 'tempeh', 'edamame', 'miso', 'tamari', 'shoyu'],
  sesame: ['sesame', 'tahini'],
  gluten: ['gluten', 'wheat'],
};

/** Phrases that contain a listed word but not the allergen. */
const LOOKALIKES: Readonly<Partial<Record<AllergenId, readonly string[]>>> = {
  milk: [
    'coconut milk',
    'oat milk',
    'rice milk',
    'almond milk',
    'soy milk',
    'cashew milk',
    'hemp milk',
    'coconut cream',
    'cream of tartar',
    'peanut butter',
    'almond butter',
    'cashew butter',
    'nut butter',
    'seed butter',
    'sunflower butter',
    'apple butter',
    'cocoa butter',
    'butter bean',
    'butter lettuce',
  ],
  tree_nut: ['water chestnut'],
  wheat: [
    'rice flour',
    'coconut flour',
    'chickpea flour',
    'gram flour',
    'corn flour',
    'almond flour',
    'cassava flour',
    'tapioca flour',
    'potato flour',
    'rice noodle',
    'glass noodle',
    'corn tortilla',
    'rice paper',
  ],
  gluten: [
    'rice flour',
    'coconut flour',
    'chickpea flour',
    'gram flour',
    'corn flour',
    'almond flour',
    'cassava flour',
    'tapioca flour',
    'potato flour',
    'rice noodle',
    'glass noodle',
    'corn tortilla',
    'rice paper',
  ],
};

/** Qualifier → allergens it clears for the words right after it. */
const QUALIFIERS: Readonly<Record<string, readonly AllergenId[]>> = {
  'dairy-free': ['milk'],
  'milk-free': ['milk'],
  'egg-free': ['egg'],
  eggless: ['egg'],
  'gluten-free': ['gluten', 'wheat'],
  'wheat-free': ['wheat'],
  'nut-free': ['tree_nut', 'peanut'],
  'soy-free': ['soy'],
  'sesame-free': ['sesame'],
  vegan: ['milk', 'egg', 'fish', 'shellfish'],
  'plant-based': ['milk', 'egg', 'fish', 'shellfish'],
};

/** How many words after a qualifier it covers. */
const QUALIFIER_REACH = 3;

/** Lowercase, accents folded, "dairy free" → "dairy-free", split into words. */
export function words(text: string): string[] {
  const folded = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\b(dairy|milk|egg|gluten|wheat|nut|soy|sesame)\s+free\b/g, '$1-free')
    .replace(/\bplant\s+based\b/g, 'plant-based');
  return folded.match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g) ?? [];
}

/** Singular, un-"-ed" form, so "anchovies" meets "anchovy" and "buttered" meets "butter". */
export function stem(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ed') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

type Phrase = readonly string[];

const phrase = (text: string): Phrase => words(text).map(stem);

interface CompiledRules {
  readonly terms: readonly Phrase[];
  readonly inherent: readonly Phrase[];
  readonly lookalikes: readonly Phrase[];
}

const compiled = new Map<AllergenId, CompiledRules>();

function rulesFor(allergen: AllergenId): CompiledRules {
  let rules = compiled.get(allergen);
  if (!rules) {
    const byLength = (a: Phrase, b: Phrase) => b.length - a.length;
    rules = {
      terms: TERMS[allergen].map(phrase).sort(byLength),
      inherent: INHERENT[allergen].map(phrase),
      lookalikes: (LOOKALIKES[allergen] ?? []).map(phrase),
    };
    compiled.set(allergen, rules);
  }
  return rules;
}

function matchAt(stems: readonly string[], index: number, target: Phrase): boolean {
  return target.length > 0 && target.every((part, offset) => stems[index + offset] === part);
}

function samePhrase(a: Phrase, b: Phrase): boolean {
  return a.length === b.length && a.every((part, index) => part === b[index]);
}

/** Every mention of `allergen` in one text. */
function scan(text: string, allergen: AllergenId): string[] {
  const raw = words(text);
  const stems = raw.map(stem);
  const rules = rulesFor(allergen);
  const covered = new Array<boolean>(stems.length).fill(false);
  stems.forEach((_, index) => {
    for (const lookalike of rules.lookalikes) {
      if (matchAt(stems, index, lookalike)) {
        for (let k = 0; k < lookalike.length; k++) covered[index + k] = true;
      }
    }
  });
  let clearedUntil = -1;
  const found: string[] = [];
  for (let index = 0; index < stems.length; index++) {
    const word = raw[index] ?? '';
    if (QUALIFIERS[word]?.includes(allergen)) {
      clearedUntil = index + QUALIFIER_REACH;
      continue;
    }
    if (covered[index]) continue;
    const term = rules.terms.find((candidate) => matchAt(stems, index, candidate));
    if (!term) continue;
    const inherent = rules.inherent.some((item) => samePhrase(item, term));
    if (index <= clearedUntil && !inherent) {
      index += term.length - 1;
      continue;
    }
    found.push(raw.slice(index, index + term.length).join(' '));
    index += term.length - 1;
  }
  return found;
}

/** Mentions of the declared allergens across the given texts, in text order. */
export function findAllergenMentions(
  texts: readonly CheckedText[],
  allergens: readonly AllergenId[],
): AllergenHit[] {
  const hits: AllergenHit[] = [];
  for (const { where, text } of texts) {
    for (const allergen of allergens) {
      for (const found of scan(text, allergen)) hits.push({ allergen, found, where });
    }
  }
  return hits;
}
