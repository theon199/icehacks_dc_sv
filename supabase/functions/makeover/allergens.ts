/**
 * A word-level allergen check for AI-written recipe text.
 *
 * Famara's catalog allergen data is the source of truth for catalog recipes. A makeover, though,
 * is free text written by a model, so before it reaches the person this module looks for words
 * that name an ingredient containing one of their declared allergens. It is deliberately
 * cautious: an unqualified "flour" counts as wheat, "oats" count as gluten, "butter" counts as
 * milk. A false alarm costs a retry; a miss could cost much more.
 *
 * Text is split into clauses (commas, brackets, "and", "or", "with" ...). Within a clause, words
 * after an explicit qualifier for that allergen ("dairy-free", "egg-free", "vegan" for milk and
 * egg, ...) are not checked, and a short list of known safe phrases ("coconut milk", "peanut
 * butter" for a milk allergy, "water chestnut" for tree nuts) is removed before matching.
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
  /** Ingredient words and phrases; "-s", "-es" and "-ed" endings are matched automatically. */
  terms: readonly string[];
  /** Phrases that contain a term but are safe for this allergen. */
  safe: readonly string[];
  /** Words that, written as "<word>-free" / "<word> free", qualify the rest of the clause. */
  freeOf: readonly string[];
  /** Whole words that qualify the rest of the clause (e.g. "vegan" for milk and egg). */
  qualifiers: readonly string[];
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
  "dumpling wrapper",
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
  "fish cake",
  "crab cake",
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
    ],
    safe: ["flax egg", "chia egg"],
    freeOf: ["egg"],
    qualifiers: [...PLANT_QUALIFIERS, "eggless"],
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
    ],
    safe: ["water chestnut"],
    freeOf: ["nut", "tree nut", "tree-nut"],
    qualifiers: [],
  },
  peanut: {
    terms: ["peanut", "groundnut", "monkey nut", "arachis", "satay"],
    safe: [],
    freeOf: ["peanut", "nut"],
    qualifiers: [],
  },
  wheat: {
    terms: WHEAT_TERMS,
    safe: WHEAT_SAFE,
    freeOf: ["wheat"],
    qualifiers: [],
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
  },
};

export interface AllergenConflict {
  allergen: AllergenId;
  /** The ingredient word that matched, as written in the vocabulary above. */
  term: string;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A phrase pattern: flexible spaces or hyphens between words, and an optional "-s", "-es" or
 * "-ed" ending ("eggs", "buttered", "floured").
 */
function phrasePattern(phrase: string): string {
  const words = phrase.split(/[\s-]+/).map(escape);
  return `${words.join("[\\s-]+")}(?:s|es|ed)?`;
}

interface CompiledRule {
  terms: { term: string; pattern: RegExp }[];
  safe: RegExp | null;
  qualifier: RegExp | null;
}

function compile(rule: AllergenRule): CompiledRule {
  const qualifierParts = [
    ...rule.freeOf.map((word) => `${phrasePattern(word)}[\\s-]?free`),
    ...rule.qualifiers.map(phrasePattern),
  ];
  return {
    terms: rule.terms.map((term) => ({
      term,
      pattern: new RegExp(`(?<![\\w'])${phrasePattern(term)}(?![\\w'])`),
    })),
    safe: rule.safe.length === 0
      ? null
      : new RegExp(`(?<![\\w'])(?:${rule.safe.map(phrasePattern).join("|")})(?![\\w'])`, "g"),
    qualifier: qualifierParts.length === 0
      ? null
      : new RegExp(`(?<![\\w'])(?:${qualifierParts.join("|")})(?![\\w'])`),
  };
}

const COMPILED: Readonly<Record<AllergenId, CompiledRule>> = Object.fromEntries(
  ALLERGEN_IDS.map((id) => [id, compile(ALLERGEN_RULES[id])]),
) as Record<AllergenId, CompiledRule>;

/** Lowercases, strips accents and normalises apostrophes so "Crème Fraîche" matches. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase();
}

const CLAUSE_SPLIT = /[,;:.!?()[\]{}\n\r/&+]|\s(?:and|or|with|plus|then|over|into|onto)\s/;

/** Finds the first matching term of `allergen` in one clause, honouring qualifiers. */
function matchClause(clause: string, rule: CompiledRule): string | null {
  let text = clause;
  if (rule.qualifier) {
    const qualified = rule.qualifier.exec(text);
    if (qualified) text = text.slice(0, qualified.index);
  }
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
