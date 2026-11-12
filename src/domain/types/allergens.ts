/**
 * Allergen vocabulary shared by the catalog, preferences and the safety filter (docs/DATA.md).
 *
 * The set is the U.S. major nine plus gluten. A recipe reports one status per allergen; anything
 * other than `free` must be treated as unsafe for a person who declared that allergen.
 */
import { z } from 'zod';

import { jsonText } from './json';

export const ALLERGEN_IDS = [
  'milk',
  'egg',
  'fish',
  'shellfish',
  'tree_nut',
  'peanut',
  'wheat',
  'soy',
  'sesame',
  'gluten',
] as const;

export type AllergenId = (typeof ALLERGEN_IDS)[number];

export const allergenIdSchema = z.enum(ALLERGEN_IDS);

export const ALLERGEN_STATUSES = ['contains', 'free', 'unknown'] as const;

/** Per-recipe status: `unknown` means at least one ingredient could not be verified. */
export type AllergenStatus = (typeof ALLERGEN_STATUSES)[number];

export type AllergenMap = Readonly<Record<AllergenId, AllergenStatus>>;

/** Display names for settings, chips and safety explanations. */
export const ALLERGEN_LABELS: Readonly<Record<AllergenId, string>> = {
  milk: 'Milk',
  egg: 'Egg',
  fish: 'Fish',
  shellfish: 'Shellfish',
  tree_nut: 'Tree nuts',
  peanut: 'Peanuts',
  wheat: 'Wheat',
  soy: 'Soy',
  sesame: 'Sesame',
  gluten: 'Gluten',
};

export function isAllergenId(value: unknown): value is AllergenId {
  return typeof value === 'string' && (ALLERGEN_IDS as readonly string[]).includes(value);
}

/** Builds a complete map from a per-allergen status; the literal keeps it exhaustive at compile time. */
export function allergenMapFrom(statusOf: (id: AllergenId) => AllergenStatus): AllergenMap {
  return {
    milk: statusOf('milk'),
    egg: statusOf('egg'),
    fish: statusOf('fish'),
    shellfish: statusOf('shellfish'),
    tree_nut: statusOf('tree_nut'),
    peanut: statusOf('peanut'),
    wheat: statusOf('wheat'),
    soy: statusOf('soy'),
    sesame: statusOf('sesame'),
    gluten: statusOf('gluten'),
  };
}

/** A map where every allergen is `unknown`: the safe default when nothing is known. */
export function unknownAllergenMap(): AllergenMap {
  return allergenMapFrom(() => 'unknown');
}

const allergenStatusSchema = z.enum(ALLERGEN_STATUSES);

/**
 * Validates the catalog's allergen object. Keys outside the vocabulary are ignored (a newer catalog
 * may know more allergens); keys that are missing become `unknown`, so absence never reads as safe.
 */
export const allergenMapSchema = z
  .record(z.string(), allergenStatusSchema)
  .transform((raw): AllergenMap => allergenMapFrom((id) => raw[id] ?? 'unknown'));

/** Same as `allergenMapSchema` but for the JSON text stored in the catalog's `allergens` column. */
export const allergenMapJsonSchema = jsonText(allergenMapSchema);
