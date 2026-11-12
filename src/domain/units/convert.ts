/**
 * Conversions between units, including ingredient-aware volume ↔ mass ↔ count conversions.
 *
 * An ingredient's `grams_per_unit` map (catalog column, already JSON-parsed) says how much one unit
 * of that ingredient weighs, e.g. `{ "cup": 125, "each": 50 }`. Keys may be any spelling that
 * `normalizeUnit` understands. A single volume entry is enough to derive a density, so knowing
 * grams per cup also answers grams per tablespoon.
 */
import { lookupUnit, UNITS, type Dimension, type UnitId } from './units';

/** Raw `grams_per_unit` map as it appears in catalog data. */
export type GramsPerUnitInput = Readonly<Record<string, number>> | null | undefined;

/** Normalised `grams_per_unit`: canonical unit ids, only positive finite weights. */
export type GramsPerUnit = Readonly<Partial<Record<UnitId, number>>>;

const EMPTY: GramsPerUnit = Object.freeze({});

export function normalizeGramsPerUnit(input: GramsPerUnitInput): GramsPerUnit {
  if (!input) return EMPTY;
  const out: Partial<Record<UnitId, number>> = {};
  // Sort keys so that when two spellings collide the result does not depend on insertion order.
  for (const key of Object.keys(input).sort()) {
    const grams = input[key];
    const found = lookupUnit(key);
    if (!found || grams == null || !Number.isFinite(grams) || grams <= 0) continue;
    if (out[found.unit] === undefined) out[found.unit] = grams / found.scale;
  }
  return out;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Quantity in the dimension's base unit (ml, g, or the count itself). */
export function toBase(quantity: number, unit: UnitId): number {
  return quantity * UNITS[unit].base;
}

export function fromBase(baseQuantity: number, unit: UnitId): number {
  return baseQuantity / UNITS[unit].base;
}

/**
 * Same-dimension conversion. Count units only convert to themselves because "a can" and "a clove"
 * have no common size. Returns `null` when the conversion is impossible.
 */
export function convertUnit(quantity: number, from: UnitId, to: UnitId): number | null {
  if (!isFiniteNumber(quantity)) return null;
  if (from === to) return quantity;
  const a = UNITS[from];
  const b = UNITS[to];
  if (a.dimension !== b.dimension || a.dimension === 'count') return null;
  return (quantity * a.base) / b.base;
}

/** Grams per millilitre for an ingredient, derived from its first usable volume entry. */
export function densityOf(gramsPerUnit: GramsPerUnit): number | null {
  // Prefer larger measures: a cup weighing is a more reliable density than a pinch.
  const order: UnitId[] = ['cup', 'l', 'pint', 'quart', 'fl_oz', 'tbsp', 'ml', 'tsp'];
  for (const unit of order) {
    const grams = gramsPerUnit[unit];
    if (grams !== undefined) return grams / UNITS[unit].base;
  }
  return null;
}

/** Weight of `quantity` × `unit` of an ingredient, or `null` if it cannot be known. */
export function toGrams(
  quantity: number,
  unit: UnitId,
  gramsPerUnit: GramsPerUnit = EMPTY,
): number | null {
  if (!isFiniteNumber(quantity)) return null;
  const d = UNITS[unit];
  if (d.dimension === 'mass') return quantity * d.base;
  const direct = gramsPerUnit[unit];
  if (direct !== undefined) return quantity * direct;
  if (d.dimension === 'volume') {
    const density = densityOf(gramsPerUnit);
    return density === null ? null : quantity * d.base * density;
  }
  return null;
}

/** Inverse of `toGrams`: how many `unit`s weigh `grams`. */
export function fromGrams(
  grams: number,
  unit: UnitId,
  gramsPerUnit: GramsPerUnit = EMPTY,
): number | null {
  const one = toGrams(1, unit, gramsPerUnit);
  if (one === null || one <= 0 || !isFiniteNumber(grams)) return null;
  return grams / one;
}

/**
 * Convert between any two units for one ingredient. Same-dimension conversions are exact; anything
 * else routes through grams using the ingredient's weights.
 */
export function convertAmount(
  quantity: number,
  from: UnitId,
  to: UnitId,
  gramsPerUnit: GramsPerUnit = EMPTY,
): number | null {
  const direct = convertUnit(quantity, from, to);
  if (direct !== null) return direct;
  // Two different count units of the same ingredient both have weights: go through grams.
  const grams = toGrams(quantity, from, gramsPerUnit);
  if (grams === null) return null;
  return fromGrams(grams, to, gramsPerUnit);
}

/** True when an amount in `unit` can be expressed in `dimension` for this ingredient. */
export function canExpressIn(
  unit: UnitId,
  dimension: Dimension,
  gramsPerUnit: GramsPerUnit = EMPTY,
): boolean {
  const own = UNITS[unit].dimension;
  if (own === dimension) return own !== 'count';
  if (dimension === 'mass') return toGrams(1, unit, gramsPerUnit) !== null;
  if (dimension === 'volume') {
    return toGrams(1, unit, gramsPerUnit) !== null && densityOf(gramsPerUnit) !== null;
  }
  return false;
}
