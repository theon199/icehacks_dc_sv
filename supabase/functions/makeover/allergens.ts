/**
 * A word-level allergen check for AI-written recipe text.
 *
 * Famara's catalog allergen data is the source of truth for catalog recipes. A makeover, though,
 * is free text written by a model, so before it reaches the person this module looks for words
 * that name an ingredient containing one of their declared allergens. It is deliberately
 * cautious: an unqualified "flour" counts as wheat, "oats" count as gluten, "butter" counts as
 * milk. A false alarm costs a retry; a miss could cost much more.
 *
 * Text is split into clauses (commas, brackets, "and", "or", "with" ...). An explicit qualifier
 * for an allergen ("dairy-free", "egg-free", "vegan" for milk and egg, ...) only covers the short
 * ingredient phrase right after it: at most three words, ending early at a preposition or article
 * ("in", "by", "the" ...), at a participle or adverb ("topped", "generously"), or once the phrase
 * has named an ingredient. Everything else in the clause is still checked, so "vegan pasta
 * drizzled in butter" is flagged for milk. A qualifier never covers a word that is the allergen
 * itself ("sesame-free za'atar", "nut-free almonds"). A short list of known safe phrases
 * ("coconut milk", "peanut butter" for a milk allergy, "water chestnut" for tree nuts) is removed
 * before matching.
 */

export const ALLERGEN_IDS = [
  "milk",
  "egg",
  "fish",
  "shellfish",
  "tree_nut",
  "peanut",
  "wheat",
  "soy",
  "sesame",
  "gluten",
] as const;
export type AllergenId = (typeof ALLERGEN_IDS)[number];

interface AllergenRule {
  /**
   * Ingredient words and phrases. "-s", "-es" and "-ed" endings, and "-ies" / "-ied" for words
   * ending in a consonant and "y", are matched automatically.
   */
  terms: readonly string[];
  /** Phrases that contain a term but are safe for this allergen. */
  safe: readonly string[];
  /** Words that, written as "<word>-free" / "<word> free", qualify the phrase after them. */
  freeOf: readonly string[];
  /** Whole words that qualify the phrase after them (e.g. "vegan" for milk and egg). */
  qualifiers: readonly string[];
  /**
   * Terms that are the allergen itself, so a qualifier in front of them is a contradiction and
   * never covers them ("nut-free almonds"). Terms with real free-from versions (dairy-free
   * cheese, gluten-free oats, plant-based tuna) stay out of this list.
   */
  intrinsic: readonly string[];
}

const PLANT_QUALIFIERS = ["vegan", "plant-based", "plant based"] as const;

const WHEAT_TERMS = [
  "wheat",
  "flour",
  "all-purpose flour",
  "bread",
  "flatbread",
  "cornbread",
  "shortbread",
  "breadcrumb",
  "bread crumb",
  "panko",
  "crouton",
  "cracker",
  "pasta",
  "spaghetti",
  "linguine",
  "fettuccine",
  "penne",
  "rigatoni",
  "fusilli",
  "macaroni",
  "lasagna",
  "lasagne",
  "orzo",
  "gnocchi",
  "noodle",
  "udon",
  "ramen",
  "couscous",
  "bulgur",
  "bulgar",
  "freekeh",
  "semolina",
  "durum",
  "spelt",
  "farro",
  "einkorn",
  "emmer",
  "kamut",
  "seitan",
  "soy sauce",
  "shoyu",
  "teriyaki",
  "hoisin",
  "tortilla",
  "pita",
  "naan",
  "roti",
  "chapati",
  "paratha",
  "bun",
  "bagel",
  "croissant",
  "pastry",
  "puff pastry",
  "phyllo",
  "filo",
  "wonton",
  "dumpling",
  "brioche",
  "pie crust",
  "biscuit",
  "cake",
  "cookie",
  "pancake",
  "waffle",
] as const;

const WHEAT_SAFE = [
  "rice flour",
  "brown rice flour",
  "almond flour",
  "coconut flour",
  "chickpea flour",
  "gram flour",
  "oat flour",
  "buckwheat flour",
  "corn flour",
  "masa harina",
  "tapioca flour",
  "cassava flour",
  "potato flour",
  "sorghum flour",
  "millet flour",
  "teff flour",
  "arrowroot flour",
  "quinoa flour",
  "lentil flour",
  "rice noodle",
  "rice vermicelli",
  "glass noodle",
  "cellophane noodle",
  "mung bean noodle",
  "sweet potato noodle",
  "kelp noodle",
  "shirataki noodle",
  "zucchini noodle",
  "rice pasta",
  "brown rice pasta",
  "chickpea pasta",
  "lentil pasta",
  "bean pasta",
  "corn pasta",
  "quinoa pasta",
  "corn tortilla",
  "rice paper",
  "spaghetti squash",
  "cauliflower crust",
  "lettuce bun",
  "rice cake",
  "rice cracker",
] as const;

/** Grains that are wheat by definition: no "wheat-free" or "gluten-free" label makes them safe. */
const WHEAT_INTRINSIC = [
  "wheat",
  "spelt",
  "semolina",
  "durum",
  "farro",
  "einkorn",
  "emmer",
  "kamut",
  "freekeh",
  "bulgur",
  "bulgar",
  "seitan",
] as const;

export const ALLERGEN_RULES: Readonly<Record<AllergenId, AllergenRule>> = {
  milk: {
    terms: [
      "milk",
      "buttermilk",
      "butter",
      "cream",
      "creme fraiche",
      "cheese",
      "cheddar",
      "mozzarella",
      "parmesan",
      "parmigiano",
      "pecorino",
      "ricotta",
      "feta",
      "paneer",
      "halloumi",
      "brie",
      "camembert",
      "gouda",
      "gruyere",
      "mascarpone",
      "burrata",
      "queso",
      "cotija",
      "labneh",
      "quark",
      "skyr",
      "ghee",
      "yogurt",
      "yoghurt",
      "curd",
      "kefir",
      "whey",
      "casein",
      "caseinate",
      "lactose",
      "custard",
      "half-and-half",
      "ice cream",
      "dulce de leche",
      "raita",
      "tzatziki",
      "pesto",
      "brioche",
    ],
    safe: [
      "coconut milk",
      "almond milk",
      "oat milk",
      "soy milk",
      "soya milk",
      "rice milk",
      "cashew milk",
      "hemp milk",
      "pea milk",
      "flax milk",
      "macadamia milk",
      "coconut cream",
      "cream of coconut",
      "cashew cream",
      "cream of tartar",
      "coconut yogurt",
      "coconut yoghurt",
      "soy yogurt",
      "almond yogurt",
      "oat yogurt",
      "peanut butter",
      "almond butter",
      "cashew butter",
      "nut butter",
      "seed butter",
      "sunflower butter",
      "sunflower seed butter",
      "cocoa butter",
      "cacao butter",
      "apple butter",
      "bean curd",
    ],
    freeOf: ["dairy", "milk"],
    qualifiers: PLANT_QUALIFIERS,
    intrinsic: [],
  },
  egg: {
    terms: [
      "egg",
      "egg white",
      "egg yolk",
      "yolk",
      "albumen",
      "albumin",
      "mayonnaise",
      "mayo",
      "meringue",
      "aioli",
      "hollandaise",
      "custard",
      "eggnog",
      "brioche",
    ],
    safe: ["flax egg", "chia egg"],
    freeOf: ["egg"],
    qualifiers: [...PLANT_QUALIFIERS, "eggless"],
    intrinsic: [],
  },
  fish: {
    terms: [
      "fish",
      "fish sauce",
      "salmon",
      "tuna",
      "cod",
      "haddock",
      "halibut",
      "pollock",
      "tilapia",
      "trout",
      "sardine",
      "anchovy",
      "anchovies",
      "mackerel",
      "herring",
      "sea bass",
      "snapper",
      "catfish",
      "swordfish",
      "mahi mahi",
      "monkfish",
      "barramundi",
      "whitefish",
      "sole",
      "flounder",
      "eel",
      "bonito",
      "katsuobushi",
      "dashi",
      "caviar",
      "roe",
      "surimi",
      "worcestershire",
      "caesar dressing",
    ],
    safe: [],
    freeOf: ["fish"],
    qualifiers: PLANT_QUALIFIERS,
    intrinsic: [],
  },
  shellfish: {
    terms: [
      "shellfish",
      "shrimp",
      "prawn",
      "crab",
      "lobster",
      "crayfish",
      "crawfish",
      "langoustine",
      "scampi",
      "abalone",
      "scallop",
      "clam",
      "mussel",
      "oyster",
      "oyster sauce",
      "squid",
      "calamari",
      "octopus",
      "cuttlefish",
      "krill",
      "shrimp paste",
    ],
    safe: ["oyster mushroom", "mushroom oyster sauce", "crab apple"],
    freeOf: ["shellfish"],
    qualifiers: PLANT_QUALIFIERS,
    intrinsic: [],
  },
  tree_nut: {
    terms: [
      "nut",
      "mixed nuts",
      "almond",
      "cashew",
      "walnut",
      "pecan",
      "pistachio",
      "hazelnut",
      "filbert",
      "macadamia",
      "brazil nut",
      "pine nut",
      "pignoli",
      "chestnut",
      "praline",
      "marzipan",
      "frangipane",
      "gianduja",
      "amaretto",
      "orgeat",
      "pesto",
    ],
    safe: ["water chestnut"],
    freeOf: ["nut", "tree nut", "tree-nut"],
    qualifiers: [],
    intrinsic: [
      "almond",
      "cashew",
      "walnut",
      "pecan",
      "pistachio",
      "hazelnut",
      "filbert",
      "macadamia",
      "brazil nut",
      "pine nut",
      "pignoli",
      "chestnut",
    ],
  },
  peanut: {
    terms: ["peanut", "groundnut", "monkey nut", "arachis", "satay"],
    safe: [],
    freeOf: ["peanut", "nut"],
    qualifiers: [],
    intrinsic: ["peanut", "groundnut", "monkey nut", "arachis"],
  },
  wheat: {
    terms: WHEAT_TERMS,
    safe: WHEAT_SAFE,
    freeOf: ["wheat"],
    qualifiers: [],
    intrinsic: WHEAT_INTRINSIC,
  },
  soy: {
    terms: [
      "soy",
      "soya",
      "soybean",
      "soy sauce",
      "shoyu",
      "tamari",
      "tofu",
      "tempeh",
      "edamame",
      "miso",
      "natto",
      "yuba",
      "okara",
      "bean curd",
      "textured vegetable protein",
      "teriyaki",
      "hoisin",
    ],
    safe: [],
    freeOf: ["soy"],
    qualifiers: [],
    intrinsic: [],
  },
  sesame: {
    terms: [
      "sesame",
      "sesame oil",
      "sesame seed",
      "tahini",
      "tahina",
      "benne",
      "gomasio",
      "halva",
      "halvah",
      "za'atar",
      "zaatar",
      "furikake",
      "dukkah",
      "hummus",
    ],
    safe: [],
    freeOf: ["sesame", "tahini"],
    qualifiers: [],
    intrinsic: [
      "sesame",
      "sesame oil",
      "sesame seed",
      "tahini",
      "tahina",
      "benne",
      "gomasio",
      "halva",
      "halvah",
      "za'atar",
      "zaatar",
      "furikake",
      "dukkah",
    ],
  },
  gluten: {
    terms: [
      ...WHEAT_TERMS,
      "gluten",
      "barley",
      "rye",
      "malt",
      "malt vinegar",
      "brewer's yeast",
      "beer",
      "triticale",
      "oat",
      "oatmeal",
      "rolled oat",
      "porridge oat",
    ],
    safe: WHEAT_SAFE.filter((phrase) => phrase !== "oat flour"),
    freeOf: ["gluten"],
    qualifiers: [],
    intrinsic: [...WHEAT_INTRINSIC, "barley", "rye", "triticale", "malt"],
  },
};

export interface AllergenConflict {
  allergen: AllergenId;
  /** The ingredient word that matched, as written in the vocabulary above. */
  term: string;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A phrase pattern: flexible spaces or hyphens between words, and an optional ending on the last
 * word: "-s", "-es" or "-ed" ("eggs", "buttered", "floured"), or "-ies" / "-ied" in place of a
 * final "y" after a consonant ("pastries", "anchovies").
 */
function phrasePattern(phrase: string): string {
  const words = phrase.split(/[\s-]+/);
  const last = words.pop() ?? "";
  const ending = /[^aeiou]y$/.test(last)
    ? `${escape(last.slice(0, -1))}(?:y|ies|ied)`
    : `${escape(last)}(?:s|es|ed)?`;
  return [...words.map(escape), ending].join("[\\s-]+");
}

const WORD_START = "(?<![\\w'])";
const WORD_END = "(?![\\w'])";
const anyOf = (phrases: readonly string[]) => `(?:${phrases.map(phrasePattern).join("|")})`;

interface CompiledRule {
  terms: { term: string; pattern: RegExp }[];
  safe: RegExp | null;
  /** Global, so every qualifier in a clause is found. */
  qualifier: RegExp | null;
  /** Anchored: tested on the text that starts at a word. */
  intrinsic: RegExp | null;
}

function compile(rule: AllergenRule): CompiledRule {
  const qualifierParts = [
    ...rule.freeOf.map((word) => `${phrasePattern(word)}[\\s-]?free`),
    ...rule.qualifiers.map(phrasePattern),
  ];
  return {
    terms: rule.terms.map((term) => ({
      term,
      pattern: new RegExp(`${WORD_START}${phrasePattern(term)}${WORD_END}`),
    })),
    safe: rule.safe.length === 0
      ? null
      : new RegExp(`${WORD_START}${anyOf(rule.safe)}${WORD_END}`, "g"),
    qualifier: qualifierParts.length === 0
      ? null
      : new RegExp(`${WORD_START}(?:${qualifierParts.join("|")})${WORD_END}`, "g"),
    intrinsic: rule.intrinsic.length === 0
      ? null
      : new RegExp(`^${anyOf(rule.intrinsic)}${WORD_END}`),
  };
}

const COMPILED: Readonly<Record<AllergenId, CompiledRule>> = {
  milk: compile(ALLERGEN_RULES.milk),
  egg: compile(ALLERGEN_RULES.egg),
  fish: compile(ALLERGEN_RULES.fish),
  shellfish: compile(ALLERGEN_RULES.shellfish),
  tree_nut: compile(ALLERGEN_RULES.tree_nut),
  peanut: compile(ALLERGEN_RULES.peanut),
  wheat: compile(ALLERGEN_RULES.wheat),
  soy: compile(ALLERGEN_RULES.soy),
  sesame: compile(ALLERGEN_RULES.sesame),
  gluten: compile(ALLERGEN_RULES.gluten),
};

/** Lowercases, strips accents and normalises apostrophes so "Crème Fraîche" matches. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase();
}

const CLAUSE_SPLIT = /[,;:.!?()[\]{}\n\r/&+]|\s(?:and|or|with|plus|then|over|into|onto)\s/;

/** The longest ingredient phrase one qualifier can cover, in words. */
const MAX_QUALIFIED_WORDS = 3;

/** Words that end the phrase a qualifier covers: what follows is another part of the sentence. */
const PHRASE_BREAKERS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "its",
  "their",
  "your",
  "some",
  "in",
  "on",
  "at",
  "by",
  "of",
  "to",
  "for",
  "from",
  "under",
  "through",
  "until",
  "before",
  "after",
  "is",
  "are",
  "was",
  "be",
  "but",
  "as",
  "than",
]);

/** After the first word, a participle or adverb ("topped", "melting", "generously") ends it too. */
const VERB_LIKE = /(?:ed|ing|ly)$/;

/**
 * How many characters of `rest`, the text right after a qualifier, that qualifier covers: the
 * ingredient phrase it modifies, as described at the top of this file.
 */
function qualifiedLength(rest: string, rule: CompiledRule): number {
  const word = /\s*(\S+)/y;
  let covered = 0;
  for (let count = 0; count < MAX_QUALIFIED_WORDS; count++) {
    const start = word.lastIndex;
    const value = word.exec(rest)?.[1];
    if (value === undefined || PHRASE_BREAKERS.has(value)) break;
    if (count > 0 && VERB_LIKE.test(value)) break;
    if (rule.intrinsic?.test(rest.slice(start).trimStart())) break;
    covered = word.lastIndex;
    if (rule.terms.some(({ pattern }) => pattern.test(value))) break;
  }
  return covered;
}

/** Blanks out each qualifier and the phrase it covers, keeping every other character in place. */
function removeQualified(clause: string, rule: CompiledRule): string {
  if (!rule.qualifier) return clause;
  let text = clause;
  for (const match of clause.matchAll(rule.qualifier)) {
    const start = match.index;
    const end = start + match[0].length;
    const stop = end + qualifiedLength(clause.slice(end), rule);
    text = text.slice(0, start) + " ".repeat(stop - start) + text.slice(stop);
  }
  return text;
}

/** Finds the first matching term of `allergen` in one clause, honouring qualifiers. */
function matchClause(clause: string, rule: CompiledRule): string | null {
  let text = removeQualified(clause, rule);
  if (rule.safe) text = text.replace(rule.safe, " ");
  for (const { term, pattern } of rule.terms) {
    if (pattern.test(text)) return term;
  }
  return null;
}

/**
 * Every declared allergen that one of `texts` mentions, with the first term found for each.
 * An empty result means no allergen word was found, not that the recipe is certified safe.
 */
export function findAllergenConflicts(
  texts: readonly string[],
  allergens: readonly AllergenId[],
): AllergenConflict[] {
  const clauses = texts.flatMap((text) => normalizeText(text).split(CLAUSE_SPLIT));
  const conflicts: AllergenConflict[] = [];
  for (const allergen of new Set(allergens)) {
    const rule = COMPILED[allergen];
    for (const clause of clauses) {
      const term = matchClause(clause, rule);
      if (term) {
        conflicts.push({ allergen, term });
        break;
      }
    }
  }
  return conflicts;
}
