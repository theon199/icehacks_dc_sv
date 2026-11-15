/**
 * Turns what the model wrote into the shapes the app accepts: names tidied, duplicates merged,
 * numbers kept inside plausible bounds. Nothing here trusts the model to have followed the schema
 * to the letter.
 */

import type { z } from "zod";
import {
  type DishModelSchema,
  PANTRY_UNITS,
  type PantryReadItem,
  type PantryUnit,
  SNAP_LIMITS,
} from "./schema.ts";

export interface PantryItem {
  name: string;
  quantity: number | null;
  unit: PantryUnit | null;
  confidence: number;
}

export interface NutrientRange {
  estimate: number;
  low: number;
  high: number;
}

const NUTRIENTS = {
  kcal: { max: 5_000, decimals: 0 },
  protein_g: { max: 500, decimals: 1 },
  carbs_g: { max: 1_000, decimals: 1 },
  fat_g: { max: 500, decimals: 1 },
  fiber_g: { max: 200, decimals: 1 },
  sodium_mg: { max: 20_000, decimals: 0 },
} as const;
export type Nutrient = keyof typeof NUTRIENTS;

export interface SnapDish {
  name: string;
  cuisine: string | null;
  key_ingredients: string[];
  portion: string;
  nutrition: Record<Nutrient, NutrientRange>;
  /** Always "estimated": these numbers come from a photo, not from a recipe. */
  nutrition_confidence: "estimated";
  confidence: number;
}

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

function cleanName(value: string, max: number = SNAP_LIMITS.maxNameChars): string {
  const name = value.replace(/\s+/g, " ").trim();
  return name.length > max ? name.slice(0, max).trimEnd() : name;
}

const isUnit = (value: string | null): value is PantryUnit =>
  value !== null && (PANTRY_UNITS as readonly string[]).includes(value);

/** Drops empty names, merges duplicates (keeping the most confident), sorts by confidence. */
export function normalizePantry(items: readonly PantryReadItem[]): PantryItem[] {
  const byName = new Map<string, PantryItem>();
  for (const raw of items) {
    const name = cleanName(raw.name).toLowerCase();
    if (name === "") continue;
    const rounded = raw.quantity !== null && Number.isFinite(raw.quantity)
      ? roundTo(Math.min(raw.quantity, 10_000), 2)
      : 0;
    // A trace amount that rounds to 0 is reported as unknown: the app only accepts positive ones.
    const quantity = rounded > 0 ? rounded : null;
    const unit = isUnit(raw.unit) ? raw.unit : null;
    const item: PantryItem = {
      name,
      quantity: unit === null ? null : quantity,
      unit: quantity === null ? null : unit,
      confidence: roundTo(clamp(raw.confidence, 0, 1), 2),
    };
    const existing = byName.get(name);
    if (!existing || item.confidence > existing.confidence) byName.set(name, item);
  }
  return [...byName.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, SNAP_LIMITS.maxItems);
}

/** Puts each range in order (low <= estimate <= high), within plausible bounds, and rounds it. */
export function normalizeRange(raw: NutrientRange, nutrient: Nutrient): NutrientRange {
  const { max, decimals } = NUTRIENTS[nutrient];
  const estimate = clamp(raw.estimate, 0, max);
  const low = clamp(Math.min(raw.low, estimate), 0, max);
  const high = clamp(Math.max(raw.high, estimate), 0, max);
  return {
    estimate: roundTo(estimate, decimals),
    low: roundTo(low, decimals),
    high: roundTo(high, decimals),
  };
}

export function normalizeDish(
  raw: NonNullable<z.output<typeof DishModelSchema>["dish"]>,
): SnapDish | null {
  const name = cleanName(raw.name, 80);
  if (name === "") return null;
  const cuisine = raw.cuisine === null ? null : cleanName(raw.cuisine, 40).toLowerCase() || null;
  const ingredients: string[] = [];
  for (const entry of raw.key_ingredients) {
    const ingredient = cleanName(entry).toLowerCase();
    if (ingredient !== "" && !ingredients.includes(ingredient)) ingredients.push(ingredient);
  }
  const nutrition: Record<Nutrient, NutrientRange> = {
    kcal: normalizeRange(raw.nutrition.kcal, "kcal"),
    protein_g: normalizeRange(raw.nutrition.protein_g, "protein_g"),
    carbs_g: normalizeRange(raw.nutrition.carbs_g, "carbs_g"),
    fat_g: normalizeRange(raw.nutrition.fat_g, "fat_g"),
    fiber_g: normalizeRange(raw.nutrition.fiber_g, "fiber_g"),
    sodium_mg: normalizeRange(raw.nutrition.sodium_mg, "sodium_mg"),
  };
  return {
    name,
    cuisine,
    key_ingredients: ingredients.slice(0, SNAP_LIMITS.maxKeyIngredients),
    portion: cleanName(raw.portion, 80) || "one serving",
    nutrition,
    nutrition_confidence: "estimated",
    confidence: roundTo(clamp(raw.confidence, 0, 1), 2),
  };
}
