import type { IngredientDef } from '../knowledge/define.ts';
import { VOLUME_ML } from '../parse/measure.ts';
import type { FdcPortion } from '../sources/fdc.ts';
import { ALLERGEN_IDS, DietFlag, type AllergenId, type IngredientCategory } from '../types.ts';

/** Allergens an ingredient certainly contains. Wheat always implies gluten. */
export function ingredientAllergens(def: IngredientDef): AllergenId[] {
  const set = new Set<AllergenId>(def.allergens);
  if (set.has('wheat')) set.add('gluten');
  return ALLERGEN_IDS.filter((a) => set.has(a));
}

export function ingredientAllergenStatus(def: IngredientDef): 'resolved' | 'unknown' {
  return def.variable ? 'unknown' : 'resolved';
}

/**
 * Diet flags an ingredient is compatible with.
 * - vegetarian: no meat, poultry, gelatin, fish or shellfish
 * - vegan: vegetarian and no milk, egg or other animal product (honey); never claimed for
 *   variable store-bought products unless they are sold as plant-based
 * - pescatarian: no land-animal meat (fish and shellfish allowed)
 * - no_pork / no_beef: not that animal, and not gelatin or unspecified meat (source unknown)
 * - no_alcohol: no wine, beer, spirits or alcohol-based cooking liquids
 * - gluten_free / dairy_free: no gluten / milk, and not a variable product
 * - halal_friendly: no_pork and no_alcohol and no gelatin or unspecified meat (informational)
 */
export function ingredientDietFlags(def: IngredientDef): number {
  const allergens = new Set(ingredientAllergens(def));
  const seafood = allergens.has('fish') || allergens.has('shellfish');
  const meat = def.meat;
  let flags = 0;
  const vegetarian = meat === null && !seafood;
  if (vegetarian) flags |= DietFlag.vegetarian;
  if (vegetarian && !allergens.has('milk') && !allergens.has('egg') && !def.animalProduct && (!def.variable || def.labelledVegan)) flags |= DietFlag.vegan;
  if (meat === null) flags |= DietFlag.pescatarian;
  const unknownAnimal = meat === 'gelatin' || meat === 'mixed';
  if (meat !== 'pork' && !unknownAnimal) flags |= DietFlag.no_pork;
  if (meat !== 'beef' && !unknownAnimal) flags |= DietFlag.no_beef;
  if (!def.alcohol) flags |= DietFlag.no_alcohol;
  if (!allergens.has('gluten') && !def.variable) flags |= DietFlag.gluten_free;
  if (!allergens.has('milk') && !def.variable) flags |= DietFlag.dairy_free;
  if (meat !== 'pork' && !unknownAnimal && !def.alcohol) flags |= DietFlag.halal_friendly;
  return flags;
}

/** Fallback cup weights by category, used only when neither FDC nor the table gives one. */
const CUP_GRAMS: Record<IngredientCategory, number> = {
  produce: 150,
  protein: 225,
  dairy: 245,
  grain: 180,
  legume: 180,
  nut_seed: 140,
  spice: 110,
  condiment: 250,
  oil: 218,
  sweetener: 200,
  beverage: 240,
  other: 200,
};

const PORTION_UNITS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(cup|cups)\b/, 'cup'],
  [/^(tbsp|tablespoons?)\b/, 'tbsp'],
  [/^(tsp|teaspoons?)\b/, 'tsp'],
  [/^(extra large|jumbo|large)\b/, 'large'],
  [/^medium\b/, 'medium'],
  [/^small\b/, 'small'],
  [/^(slice|slices)\b/, 'slice'],
  [/^(clove|cloves)\b/, 'clove'],
  [/^(stalk|stalks|spear|spears)\b/, 'stalk'],
  [/^(leaf|leaves)\b/, 'leaf'],
  [/^(sprig|sprigs)\b/, 'sprig'],
  [/^(stick|sticks)\b/, 'stick'],
  [/^(fillet|fillets|filet)\b/, 'fillet'],
  [/^(head|heads)\b/, 'head'],
  [/^(ear|ears)\b/, 'ear'],
  [/^(bunch|bunches)\b/, 'bunch'],
  [/^(package|pkg|packet)\b/, 'packet'],
  [/^(can|cans)\b/, 'can'],
  [/^(piece|pieces|each|whole|fruit|link|patty|roll|tortilla|egg|breast|thigh|drumstick|wing|chop|shell|muffin|bagel|pita|pepper|onion|potato|carrot|tomato|banana|apple|orange|lemon|lime)\b/, 'piece'],
];

/** FDC often prefixes a size with the food name ("potato large (3\" dia)"). */
const SIZE_IN_LABEL: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(extra large|jumbo|large)\b/, 'large'],
  [/\bmedium\b/, 'medium'],
  [/\bsmall\b/, 'small'],
];
const VOLUME_LABEL = /^(cups?|tbsp|tablespoons?|tsp|teaspoons?)\b/;

/** Portion labels that describe a weight, volume or package rather than a single item. */
const NOT_A_PIECE = /^(oz|ounces?|lb|pounds?|fl\b|fluid|serving|nlea|container|unit|quantity|portion|g\b|grams?|cubic|bottle|can\b|cans\b|package|pkg|packet|bag|box|jar|pint|quart|gallon|liter|litre|ml\b|dash|pinch|drop|recipe|batch|yield|cup|tbsp|tsp|half|wedge|bunch|lb\b)/;

/** Builds unit -> grams for one ingredient from FDC household portions and table overrides. */
export function gramsPerUnit(def: IngredientDef, portions: readonly FdcPortion[]): Record<string, number> {
  const out: Record<string, number> = {};
  let namedPiece: number | undefined;
  // Recipes measure liquids as poured, so "cup, fluid" beats "cup, whipped" (heavy cream lists
  // whipped first at about half the weight). The first portion of each unit wins after sorting.
  const rank = (label: string) => (/\bfluid\b/i.test(label) ? 0 : /\b(whipped|foam)\b/i.test(label) ? 2 : 1);
  const ordered = [...portions].sort((a, b) => rank(a.label) - rank(b.label));
  for (const portion of ordered) {
    const label = portion.label.replace(/^\d+(\.\d+)?\s*/, '').trim();
    const size = SIZE_IN_LABEL.find(([pattern]) => pattern.test(label));
    const known = VOLUME_LABEL.test(label) ? PORTION_UNITS.find(([pattern]) => pattern.test(label)) : (size ?? PORTION_UNITS.find(([pattern]) => pattern.test(label)));
    if (known) {
      if (out[known[1]] === undefined) out[known[1]] = portion.grams / portion.amount;
    } else if (namedPiece === undefined && !NOT_A_PIECE.test(label)) {
      // FDC often names one item after the food itself: "cucumber (8-1/4")", "leek", "beet (2" dia)".
      namedPiece = portion.grams / portion.amount;
    }
  }
  if (out.piece === undefined && out.medium === undefined && namedPiece !== undefined) out.piece = namedPiece;
  Object.assign(out, def.units);
  if (out.cup === undefined) {
    if (out.tbsp !== undefined) out.cup = out.tbsp * 16;
    else if (out.tsp !== undefined) out.cup = out.tsp * 48;
    else out.cup = CUP_GRAMS[def.category];
  }
  const cup = out.cup;
  out.tbsp ??= (cup * VOLUME_ML.tbsp) / VOLUME_ML.cup;
  out.tsp ??= (cup * VOLUME_ML.tsp) / VOLUME_ML.cup;
  if (out.piece === undefined && out.medium !== undefined) out.piece = out.medium;
  if (out.medium === undefined && out.piece !== undefined) out.medium = out.piece;
  if (out.medium !== undefined) {
    out.small ??= out.medium * 0.75;
    out.large ??= out.medium * 1.3;
  }
  const rounded: Record<string, number> = {};
  for (const key of Object.keys(out).sort()) {
    const value = out[key];
    if (value !== undefined && value > 0) rounded[key] = Math.round(value * 100) / 100;
  }
  return rounded;
}

/** Generic weights for container/approximate units when an ingredient has no specific weight. */
export const GENERIC_UNIT_GRAMS: Readonly<Record<string, number>> = {
  can: 400,
  jar: 400,
  packet: 250,
  bag: 250,
  box: 400,
  bottle: 500,
  bunch: 60,
  handful: 30,
  knob: 15,
  splash: 10,
  drizzle: 5,
  sprinkle: 1,
  sprig: 1,
  leaf: 1,
  slice: 30,
  scoop: 60,
  glass: 240,
  shot: 30,
  drop: 0.05,
  cube: 10,
  sheet: 20,
  block: 250,
  inch: 10,
  strip: 20,
  rasher: 25,
  wedge: 30,
  loaf: 450,
  bulb: 40,
  sachet: 7,
  fillet: 150,
  stalk: 40,
  head: 500,
  ear: 90,
  floret: 12,
};

/** Plural display name: the table's own, or a regular plural the table lists as a synonym. */
export function pluralName(def: IngredientDef): string | null {
  if (def.plural) return def.plural;
  const name = def.name.toLowerCase();
  const synonyms = new Set(def.syn.map((s) => s.toLowerCase()));
  const candidates = [`${name}s`, `${name}es`, name.replace(/y$/, 'ies'), name.replace(/f$/, 'ves')];
  return candidates.find((c) => c !== name && synonyms.has(c)) ?? null;
}
