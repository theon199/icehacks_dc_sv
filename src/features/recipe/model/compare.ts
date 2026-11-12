/**
 * Side-by-side comparison of an original dish and its healthier adaptation: which ingredients were
 * swapped, dropped, added or used in a different amount, and how nutrition per serving moved.
 *
 * Amounts are compared per serving (by weight) because the two recipes may make different numbers
 * of servings.
 */
import { TARGET_KIND, type NutrientKey } from '@/domain/nutrition';
import type {
  NutritionConfidence,
  RecipeDetail,
  RecipeIngredientLine,
  RecipeNutrition,
  Substitution,
} from '@/lib/catalog';

import { ingredientName } from './ingredients';
import { formatNutrient, toNutritionFacts } from './nutrition';

export interface CompareSide {
  readonly id: string;
  readonly title: string;
  readonly servings: number;
  readonly lines: readonly Pick<RecipeIngredientLine, 'ingredientId' | 'text' | 'grams'>[];
  readonly nutrition: RecipeNutrition | null;
  readonly confidence: NutritionConfidence;
}

export function sideFromRecipe(recipe: RecipeDetail): CompareSide {
  return {
    id: recipe.id,
    title: recipe.title,
    servings: recipe.servings,
    lines: recipe.ingredients,
    nutrition: recipe.nutrition,
    confidence: recipe.nutritionConfidence,
  };
}

export type DiffKind = 'swapped' | 'removed' | 'added' | 'more' | 'less' | 'same';

export interface DiffEntry {
  readonly key: string;
  readonly kind: DiffKind;
  /** Display name and original line on each side, when present there. */
  readonly before: { readonly name: string; readonly text: string } | null;
  readonly after: { readonly name: string; readonly text: string } | null;
  /** The catalog's reason for a swap, when one is known. */
  readonly note: string | null;
}

/** Amount changes smaller than this share are treated as the same amount. */
const AMOUNT_TOLERANCE = 0.15;

interface Grouped {
  readonly key: string;
  readonly ingredientId: string | null;
  readonly name: string;
  readonly text: string;
  /** Grams per serving, or null when any line for it has no weight. */
  readonly gramsPerServing: number | null;
}

function lineKey(line: Pick<RecipeIngredientLine, 'ingredientId' | 'text'>): string {
  return line.ingredientId ?? `text:${ingredientName(line.text).toLowerCase()}`;
}

function group(side: CompareSide): Map<string, Grouped> {
  const servings = side.servings > 0 ? side.servings : 1;
  const out = new Map<string, Grouped>();
  for (const line of side.lines) {
    const key = lineKey(line);
    const grams = line.grams ?? null;
    const existing = out.get(key);
    if (existing) {
      const sum =
        existing.gramsPerServing === null || grams === null
          ? null
          : existing.gramsPerServing + grams / servings;
      out.set(key, { ...existing, gramsPerServing: sum });
    } else {
      out.set(key, {
        key,
        ingredientId: line.ingredientId,
        name: ingredientName(line.text),
        text: line.text,
        gramsPerServing: grams === null ? null : grams / servings,
      });
    }
  }
  return out;
}

const view = (g: Grouped) => ({ name: g.name, text: g.text });

const KIND_ORDER: Readonly<Record<DiffKind, number>> = {
  swapped: 0,
  removed: 1,
  added: 2,
  less: 3,
  more: 4,
  same: 5,
};

/**
 * Ingredient differences from `before` to `after`. A dropped ingredient and a new one are paired
 * as a swap when the catalog lists that substitution.
 */
export function diffIngredients(
  before: CompareSide,
  after: CompareSide,
  substitutions: readonly Substitution[] = [],
): DiffEntry[] {
  const a = group(before);
  const b = group(after);
  const entries: DiffEntry[] = [];
  const removed: Grouped[] = [];
  const added = new Map<string, Grouped>();
  for (const [key, g] of b) if (!a.has(key)) added.set(key, g);

  for (const [key, g] of a) {
    const other = b.get(key);
    if (!other) {
      removed.push(g);
      continue;
    }
    let kind: DiffKind = 'same';
    if (g.gramsPerServing !== null && other.gramsPerServing !== null && g.gramsPerServing > 0) {
      const change = (other.gramsPerServing - g.gramsPerServing) / g.gramsPerServing;
      if (change > AMOUNT_TOLERANCE) kind = 'more';
      else if (change < -AMOUNT_TOLERANCE) kind = 'less';
    }
    entries.push({ key, kind, before: view(g), after: view(other), note: null });
  }

  for (const g of removed) {
    const swap = g.ingredientId
      ? substitutions.find((s) => s.fromId === g.ingredientId && added.has(s.toId))
      : undefined;
    const partner = swap ? added.get(swap.toId) : undefined;
    if (swap && partner) {
      added.delete(swap.toId);
      entries.push({
        key: `${g.key}>${partner.key}`,
        kind: 'swapped',
        before: view(g),
        after: view(partner),
        note: swap.note,
      });
    } else {
      entries.push({ key: g.key, kind: 'removed', before: view(g), after: null, note: null });
    }
  }
  for (const g of added.values()) {
    entries.push({ key: g.key, kind: 'added', before: null, after: view(g), note: null });
  }
  return entries.sort(
    (x, y) =>
      KIND_ORDER[x.kind] - KIND_ORDER[y.kind] ||
      (x.before ?? x.after)!.name.localeCompare((y.before ?? y.after)!.name),
  );
}

export type DeltaDirection = 'better' | 'worse' | 'neutral' | 'same' | 'unknown';

export interface NutritionDelta {
  readonly key: NutrientKey;
  readonly label: string;
  readonly before: string;
  readonly after: string;
  /** Signed, formatted change ("−120 kcal", "+4 g"); null when either side is unknown. */
  readonly change: string | null;
  readonly direction: DeltaDirection;
}

const DELTA_NUTRIENTS: readonly { key: NutrientKey; label: string }[] = [
  { key: 'kcal', label: 'Energy' },
  { key: 'protein_g', label: 'Protein' },
  { key: 'fiber_g', label: 'Fiber' },
  { key: 'sat_fat_g', label: 'Saturated fat' },
  { key: 'sodium_mg', label: 'Sodium' },
  { key: 'added_sugar_g', label: 'Added sugars' },
  { key: 'carbs_g', label: 'Carbohydrate' },
  { key: 'fat_g', label: 'Fat' },
];

/** Relative change under which two values read as the same. */
const SAME_SHARE = 0.03;

function directionFor(key: NutrientKey, before: number, after: number): DeltaDirection {
  const base = Math.max(Math.abs(before), Math.abs(after));
  if (base === 0 || Math.abs(after - before) / base < SAME_SHARE) return 'same';
  const kind = key in TARGET_KIND ? TARGET_KIND[key as keyof typeof TARGET_KIND] : null;
  if (kind === 'min') return after > before ? 'better' : 'worse';
  if (kind === 'max') return after < before ? 'better' : 'worse';
  return 'neutral';
}

function signed(key: NutrientKey, delta: number): string {
  const text = formatNutrient(key, Math.abs(delta));
  return `${delta < 0 ? '−' : '+'}${text}`;
}

/** Per-serving nutrition changes, health-relevant nutrients first. */
export function nutritionDeltas(
  before: RecipeNutrition | null,
  after: RecipeNutrition | null,
): NutritionDelta[] {
  const a = before ? toNutritionFacts(before) : {};
  const b = after ? toNutritionFacts(after) : {};
  return DELTA_NUTRIENTS.map(({ key, label }) => {
    const x = a[key];
    const y = b[key];
    const known = typeof x === 'number' && typeof y === 'number';
    return {
      key,
      label,
      before: formatNutrient(key, x),
      after: formatNutrient(key, y),
      change: known ? signed(key, y - x) : null,
      direction: known ? directionFor(key, x, y) : 'unknown',
    };
  });
}

export interface CompareSummary {
  readonly swapped: number;
  readonly removed: number;
  readonly added: number;
  readonly better: number;
  readonly worse: number;
}

export function summariseComparison(
  diff: readonly DiffEntry[],
  deltas: readonly NutritionDelta[],
): CompareSummary {
  const count = (kind: DiffKind) => diff.filter((d) => d.kind === kind).length;
  return {
    swapped: count('swapped'),
    removed: count('removed'),
    added: count('added'),
    better: deltas.filter((d) => d.direction === 'better').length,
    worse: deltas.filter((d) => d.direction === 'worse').length,
  };
}

/**
 * Orders two versions of a dish for comparison: the one with the lower health score is treated as
 * the original and the other as its healthier adaptation. Null when no other version exists.
 */
export function pairFamily<T extends { id: string; familyId: string; healthScore: number }>(
  recipe: T,
  candidates: readonly T[],
): { original: T; adapted: T } | null {
  let best: T | null = null;
  for (const other of candidates) {
    if (other.id === recipe.id || other.familyId !== recipe.familyId) continue;
    if (!best || Math.abs(other.healthScore - recipe.healthScore) > Math.abs(best.healthScore - recipe.healthScore)) {
      best = other;
    }
  }
  if (!best) return null;
  return best.healthScore >= recipe.healthScore
    ? { original: recipe, adapted: best }
    : { original: best, adapted: recipe };
}
