/**
 * Unit vocabulary for recipe and shopping quantities.
 *
 * Every unit belongs to one dimension. Volume units convert through millilitres, mass units
 * through grams. Count units ("each", "clove", "can") have no physical size of their own; they only
 * become grams through an ingredient's `grams_per_unit` map (see `convert.ts`).
 */

export type Dimension = 'volume' | 'mass' | 'count';

/** Which measuring convention a person reads quantities in. */
export type UnitSystem = 'us' | 'metric';

export type VolumeUnit =
  'pinch' | 'dash' | 'tsp' | 'tbsp' | 'fl_oz' | 'cup' | 'pint' | 'quart' | 'gallon' | 'ml' | 'l';
export type MassUnit = 'mg' | 'g' | 'kg' | 'oz' | 'lb';
export type CountUnit =
  | 'each'
  | 'clove'
  | 'slice'
  | 'can'
  | 'bunch'
  | 'sprig'
  | 'stalk'
  | 'head'
  | 'leaf'
  | 'handful'
  | 'package'
  | 'stick';

export type UnitId = VolumeUnit | MassUnit | CountUnit;

export interface UnitDef {
  readonly id: UnitId;
  readonly dimension: Dimension;
  /** Size in the dimension's base unit (ml for volume, g for mass, 1 for counts). */
  readonly base: number;
  /** Convention the unit belongs to; spoons and counts are read the same everywhere. */
  readonly system: UnitSystem | 'shared';
  readonly singular: string;
  readonly plural: string;
}

// US customary sizes, defined from the exact 1 US fluid ounce = 29.5735295625 ml.
const FL_OZ_ML = 29.5735295625;
const OZ_G = 28.349523125;

function def(
  id: UnitId,
  dimension: Dimension,
  base: number,
  system: UnitDef['system'],
  singular: string,
  plural = singular,
): UnitDef {
  return { id, dimension, base, system, singular, plural };
}

export const UNITS: Readonly<Record<UnitId, UnitDef>> = {
  pinch: def('pinch', 'volume', FL_OZ_ML / 96, 'shared', 'pinch', 'pinches'),
  dash: def('dash', 'volume', FL_OZ_ML / 48, 'shared', 'dash', 'dashes'),
  tsp: def('tsp', 'volume', FL_OZ_ML / 6, 'shared', 'tsp'),
  tbsp: def('tbsp', 'volume', FL_OZ_ML / 2, 'shared', 'tbsp'),
  fl_oz: def('fl_oz', 'volume', FL_OZ_ML, 'us', 'fl oz'),
  cup: def('cup', 'volume', FL_OZ_ML * 8, 'us', 'cup', 'cups'),
  pint: def('pint', 'volume', FL_OZ_ML * 16, 'us', 'pint', 'pints'),
  quart: def('quart', 'volume', FL_OZ_ML * 32, 'us', 'quart', 'quarts'),
  gallon: def('gallon', 'volume', FL_OZ_ML * 128, 'us', 'gallon', 'gallons'),
  ml: def('ml', 'volume', 1, 'metric', 'ml'),
  l: def('l', 'volume', 1000, 'metric', 'L'),
  mg: def('mg', 'mass', 0.001, 'metric', 'mg'),
  g: def('g', 'mass', 1, 'metric', 'g'),
  kg: def('kg', 'mass', 1000, 'metric', 'kg'),
  oz: def('oz', 'mass', OZ_G, 'us', 'oz'),
  lb: def('lb', 'mass', OZ_G * 16, 'us', 'lb'),
  each: def('each', 'count', 1, 'shared', '', ''),
  clove: def('clove', 'count', 1, 'shared', 'clove', 'cloves'),
  slice: def('slice', 'count', 1, 'shared', 'slice', 'slices'),
  can: def('can', 'count', 1, 'shared', 'can', 'cans'),
  bunch: def('bunch', 'count', 1, 'shared', 'bunch', 'bunches'),
  sprig: def('sprig', 'count', 1, 'shared', 'sprig', 'sprigs'),
  stalk: def('stalk', 'count', 1, 'shared', 'stalk', 'stalks'),
  head: def('head', 'count', 1, 'shared', 'head', 'heads'),
  leaf: def('leaf', 'count', 1, 'shared', 'leaf', 'leaves'),
  handful: def('handful', 'count', 1, 'shared', 'handful', 'handfuls'),
  package: def('package', 'count', 1, 'shared', 'package', 'packages'),
  stick: def('stick', 'count', 1, 'shared', 'stick', 'sticks'),
};

/** Words that name a unit. Lookups are case-insensitive except the single letters t and T. */
const ALIASES: Readonly<Record<string, UnitId>> = {
  pinch: 'pinch',
  pinches: 'pinch',
  dash: 'dash',
  dashes: 'dash',
  tsp: 'tsp',
  tsps: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  tbs: 'tbsp',
  tbl: 'tbsp',
  tblsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  'fl oz': 'fl_oz',
  'fl. oz': 'fl_oz',
  floz: 'fl_oz',
  fl_oz: 'fl_oz',
  'fluid ounce': 'fl_oz',
  'fluid ounces': 'fl_oz',
  c: 'cup',
  cup: 'cup',
  cups: 'cup',
  pt: 'pint',
  pint: 'pint',
  pints: 'pint',
  qt: 'quart',
  quart: 'quart',
  quarts: 'quart',
  gal: 'gallon',
  gallon: 'gallon',
  gallons: 'gallon',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  cl: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  g: 'g',
  gr: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  each: 'each',
  ea: 'each',
  piece: 'each',
  pieces: 'each',
  pc: 'each',
  pcs: 'each',
  whole: 'each',
  item: 'each',
  items: 'each',
  clove: 'clove',
  cloves: 'clove',
  slice: 'slice',
  slices: 'slice',
  can: 'can',
  cans: 'can',
  tin: 'can',
  tins: 'can',
  bunch: 'bunch',
  bunches: 'bunch',
  sprig: 'sprig',
  sprigs: 'sprig',
  stalk: 'stalk',
  stalks: 'stalk',
  rib: 'stalk',
  ribs: 'stalk',
  head: 'head',
  heads: 'head',
  leaf: 'leaf',
  leaves: 'leaf',
  handful: 'handful',
  handfuls: 'handful',
  package: 'package',
  packages: 'package',
  pkg: 'package',
  packet: 'package',
  packets: 'package',
  stick: 'stick',
  sticks: 'stick',
};

/** Centilitres are accepted as an alias but are ten millilitres each. */
const ALIAS_SCALE: Readonly<Record<string, number>> = { cl: 10 };

/**
 * Canonical unit for a free-form unit word ("Tablespoons" → `tbsp`), or `null` when the word is
 * not a unit we know. Single-letter `t` means teaspoon and `T` means tablespoon, as on recipe cards.
 */
export function normalizeUnit(raw: string | null | undefined): UnitId | null {
  return lookupUnit(raw)?.unit ?? null;
}

/** Like `normalizeUnit`, but also returns the multiplier for aliases that are scaled units. */
export function lookupUnit(raw: string | null | undefined): { unit: UnitId; scale: number } | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\.$/, '');
  if (trimmed === 't') return { unit: 'tsp', scale: 1 };
  if (trimmed === 'T') return { unit: 'tbsp', scale: 1 };
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const unit = ALIASES[key];
  if (!unit) return null;
  return { unit, scale: ALIAS_SCALE[key] ?? 1 };
}

export function isUnitId(value: string): value is UnitId {
  return Object.prototype.hasOwnProperty.call(UNITS, value);
}

export function dimensionOf(unit: UnitId): Dimension {
  return UNITS[unit].dimension;
}

/** Unit label for a quantity: "cup" vs "cups". Count-of-items (`each`) has no label. */
export function unitLabel(unit: UnitId, quantity: number): string {
  const d = UNITS[unit];
  return Math.abs(quantity) > 1 ? d.plural : d.singular;
}
