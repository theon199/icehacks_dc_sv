/**
 * Building a shopping list from planned recipes.
 *
 * 1. Every line is scaled by planned servings × portion ÷ recipe servings, then rounded per recipe
 *    the way the recipe screen shows it (`scaleLines`): whole eggs, minimum pinches. So two
 *    recipes that each need one egg after scaling add up to two eggs, not one.
 * 2. Lines for the same ingredient are merged per dimension: weights in grams, volumes in
 *    millilitres, counts per count unit. When one ingredient appears in more than one dimension,
 *    everything its `grams_per_unit` can weigh is folded into grams, so "1 cup flour" and
 *    "200 g flour" become one amount.
 * 3. Pantry quantities are subtracted (through grams when units differ). A pantry entry without a
 *    quantity covers the item entirely. A pantry unit that is present but not recognised only
 *    matches amounts written in that same unit word; it is never treated as a count. A "to taste"
 *    use is covered only by real stock left over after the measured amounts are subtracted.
 * 4. Counts are rounded up to whole items, because shops do not sell half an onion.
 * 5. Items are grouped by aisle in store-walk order and sorted by name, with the key as a final
 *    tie-break so the order never depends on input order.
 */
import { scaleLines, type ScaleOptions } from '../portions';
import {
  convertUnit,
  lookupUnit,
  normalizeGramsPerUnit,
  parseAmount,
  toGrams,
  UNITS,
  type GramsPerUnit,
  type UnitId,
} from '../units';
import type {
  AisleGroup,
  Amount,
  PantryCoverage,
  PantryEntry,
  ShoppingIngredient,
  ShoppingItem,
  ShoppingRecipe,
} from './types';

const EPSILON = 1e-6;

/** Aisles in the order most stores are walked. Unknown aisles follow alphabetically, then other. */
export const AISLE_ORDER: readonly string[] = [
  'produce',
  'bakery',
  'meat',
  'seafood',
  'deli',
  'dairy',
  'eggs',
  'frozen',
  'canned',
  'grains',
  'pasta',
  'international',
  'baking',
  'spices',
  'condiments',
  'oils',
  'snacks',
  'beverages',
  'household',
];

export function normalizeAisle(aisle: string | null | undefined): string {
  const id = (aisle ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return id.length > 0 ? id : 'other';
}

/** English display title for an aisle id. Localised titles are a follow-up for the UI layer. */
export function aisleTitle(aisle: string): string {
  const words = aisle.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function compareAisles(a: string, b: string): number {
  if (a === b) return 0;
  if (a === 'other') return 1;
  if (b === 'other') return -1;
  const ia = AISLE_ORDER.indexOf(a);
  const ib = AISLE_ORDER.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a < b ? -1 : 1;
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function compareItems(a: ShoppingItem, b: ShoppingItem): number {
  return collator.compare(a.name, b.name) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

/** Key and display name for a line that did not match a catalog ingredient. */
export function unmatchedKey(text: string): { key: string; name: string } {
  const rest = parseAmount(text).rest || text.trim();
  const name =
    rest
      .replace(/\s+/g, ' ')
      .replace(/[,;].*$/, '')
      .trim() || text.trim();
  return { key: `t:${name.toLowerCase()}`, name };
}

interface Bucket {
  grams: number;
  ml: number;
  counts: Map<UnitId, number>;
  others: Map<string, number>;
}

interface Accumulator {
  key: string;
  ingredientId: string | null;
  name: string;
  plural: string | null;
  aisle: string;
  staple: boolean;
  gpu: GramsPerUnit;
  bucket: Bucket;
  asNeeded: boolean;
  recipeIds: Set<string>;
  allOptional: boolean;
}

function newBucket(): Bucket {
  return { grams: 0, ml: 0, counts: new Map(), others: new Map() };
}

function isBlank(unit: string | null | undefined): boolean {
  return unit == null || unit.trim() === '';
}

/** Lower-cased label used for amounts in a unit word we do not recognise. */
function otherLabel(rawUnit: string): string {
  return rawUnit.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Add one already-scaled line. `unit` is the recognised unit (the quantity is already expressed
 * in it); when it is `null` and `rawUnit` is not blank, the unit word was not recognised.
 */
function addLine(
  acc: Accumulator,
  quantity: number | null,
  unit: UnitId | null,
  rawUnit: string | null,
  grams: number | null,
): void {
  const b = acc.bucket;
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) {
    if (grams !== null && Number.isFinite(grams) && grams > 0) b.grams += grams;
    else acc.asNeeded = true;
    return;
  }
  if (unit === null && rawUnit !== null && !isBlank(rawUnit)) {
    // An unrecognised unit: its weight is the only way to merge it with anything else.
    if (grams !== null && Number.isFinite(grams) && grams > 0) b.grams += grams;
    else {
      const label = otherLabel(rawUnit);
      b.others.set(label, (b.others.get(label) ?? 0) + quantity);
    }
    return;
  }
  const u: UnitId = unit ?? 'each';
  const dim = UNITS[u].dimension;
  if (dim === 'mass') b.grams += quantity * UNITS[u].base;
  else if (dim === 'volume') b.ml += quantity * UNITS[u].base;
  else b.counts.set(u, (b.counts.get(u) ?? 0) + quantity);
}

/** Fold everything that can be weighed into grams when more than one dimension is present. */
function foldIntoGrams(b: Bucket, gpu: GramsPerUnit): void {
  const dims = (b.grams > 0 ? 1 : 0) + (b.ml > 0 ? 1 : 0) + b.counts.size;
  if (dims <= 1) return;
  if (b.ml > 0) {
    const g = toGrams(b.ml, 'ml', gpu);
    if (g !== null) {
      b.grams += g;
      b.ml = 0;
    }
  }
  for (const [unit, q] of [...b.counts]) {
    const g = toGrams(q, unit, gpu);
    if (g !== null) {
      b.grams += g;
      b.counts.delete(unit);
    }
  }
}

function amountsOf(b: Bucket): Amount[] {
  const out: Amount[] = [];
  if (b.grams > EPSILON) out.push({ quantity: b.grams, unit: 'g', label: null });
  if (b.ml > EPSILON) out.push({ quantity: b.ml, unit: 'ml', label: null });
  for (const unit of [...b.counts.keys()].sort()) {
    const q = b.counts.get(unit) ?? 0;
    if (q > EPSILON) out.push({ quantity: Math.ceil(q - EPSILON), unit, label: null });
  }
  for (const label of [...b.others.keys()].sort()) {
    const q = b.others.get(label) ?? 0;
    if (q > EPSILON) out.push({ quantity: q, unit: null, label });
  }
  return out;
}

/**
 * Subtract a pantry quantity from a bucket: first from the same count unit, then grams, millilitres
 * and other counts, converting through the ingredient's weights where the units differ. Returns
 * how much of the pantry entry is left over, in its own unit.
 *
 * Only an absent or blank pantry unit means a count of items. A unit word we do not recognise
 * ("tbsp chopped") is matched only against amounts recorded under the same word.
 */
function subtractPantry(b: Bucket, entry: PantryEntry, gpu: GramsPerUnit): number {
  const raw = entry.quantity;
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return 0;
  const found = isBlank(entry.unit) ? null : lookupUnit(entry.unit);
  if (found === null && !isBlank(entry.unit)) {
    const label = otherLabel(entry.unit ?? '');
    const have = b.others.get(label) ?? 0;
    const used = Math.min(have, raw);
    if (used > 0) b.others.set(label, have - used);
    return raw - used;
  }
  const unit: UnitId = found?.unit ?? 'each';
  let left = raw * (found?.scale ?? 1);

  const targets: { unit: UnitId; get: () => number; set: (v: number) => void }[] = [];
  const countTarget = (u: UnitId) => ({
    unit: u,
    get: () => b.counts.get(u) ?? 0,
    set: (v: number) => void b.counts.set(u, v),
  });
  if (b.counts.has(unit)) targets.push(countTarget(unit));
  targets.push({ unit: 'g', get: () => b.grams, set: (v) => (b.grams = v) });
  targets.push({ unit: 'ml', get: () => b.ml, set: (v) => (b.ml = v) });
  for (const u of [...b.counts.keys()].sort()) if (u !== unit) targets.push(countTarget(u));

  for (const t of targets) {
    if (left <= EPSILON) return 0;
    const have = t.get();
    if (have <= EPSILON) continue;
    const available =
      convertUnit(left, unit, t.unit) ?? convertThroughGrams(left, unit, t.unit, gpu);
    if (available === null || available <= 0) continue;
    const used = Math.min(have, available);
    t.set(have - used);
    left *= 1 - used / available;
  }
  return left > EPSILON ? left : 0;
}

function convertThroughGrams(
  q: number,
  from: UnitId,
  to: UnitId,
  gpu: GramsPerUnit,
): number | null {
  const g = toGrams(q, from, gpu);
  if (g === null) return null;
  const one = toGrams(1, to, gpu);
  return one === null || one <= 0 ? null : g / one;
}

function bucketSize(b: Bucket): number {
  let n = b.grams + b.ml;
  for (const q of b.counts.values()) n += q;
  for (const q of b.others.values()) n += q;
  return n;
}

export interface BuildListInput {
  readonly recipes: readonly ShoppingRecipe[];
  readonly ingredients: Readonly<Record<string, ShoppingIngredient>>;
  readonly pantry?: readonly PantryEntry[] | undefined;
  /** Same override as the recipe screen's scaling, so both round counts identically. */
  readonly divisibility?: ScaleOptions['divisibility'];
}

export interface ShoppingList {
  /** Items to buy, including ones the pantry only partly covers. */
  readonly items: readonly ShoppingItem[];
  /** Items the pantry fully covers, for an "already have" section. */
  readonly inPantry: readonly ShoppingItem[];
}

export function buildShoppingList(input: BuildListInput): ShoppingList {
  const accs = new Map<string, Accumulator>();

  for (const recipe of input.recipes) {
    const base = recipe.servings > 0 && Number.isFinite(recipe.servings) ? recipe.servings : 1;
    const planned =
      recipe.plannedServings > 0 && Number.isFinite(recipe.plannedServings)
        ? recipe.plannedServings
        : base;
    const portion =
      recipe.portion !== undefined && Number.isFinite(recipe.portion) && recipe.portion > 0
        ? recipe.portion
        : 1;
    const factor = (planned * portion) / base;
    const scaled = scaleLines(recipe.ingredients, factor, { divisibility: input.divisibility });

    for (const s of scaled) {
      const line = s.line;
      const info = line.ingredient_id === null ? undefined : input.ingredients[line.ingredient_id];
      const { key, name } =
        line.ingredient_id !== null
          ? { key: `i:${line.ingredient_id}`, name: info?.name ?? line.ingredient_id }
          : unmatchedKey(line.text);
      let acc = accs.get(key);
      if (!acc) {
        acc = {
          key,
          ingredientId: line.ingredient_id,
          name,
          plural: info?.plural ?? null,
          aisle: normalizeAisle(info?.aisle),
          staple: info?.pantry_staple === true || info?.pantry_staple === 1,
          gpu: normalizeGramsPerUnit(info?.grams_per_unit),
          bucket: newBucket(),
          asNeeded: false,
          recipeIds: new Set(),
          allOptional: true,
        };
        accs.set(key, acc);
      }
      acc.recipeIds.add(recipe.recipeId);
      if (!(line.optional === true || line.optional === 1)) acc.allOptional = false;
      if (s.unit === null && !isBlank(line.unit)) {
        // Unrecognised unit word: keep the exact linear amount, there is nothing to round to.
        const grams = line.grams == null ? null : line.grams * factor;
        addLine(acc, s.exactQuantity, null, line.unit, grams);
      } else {
        addLine(acc, s.quantity, s.unit, line.unit, s.grams);
      }
    }
  }

  const pantryById = new Map<string, PantryEntry[]>();
  for (const entry of input.pantry ?? []) {
    const list = pantryById.get(entry.ingredient_id);
    if (list) list.push(entry);
    else pantryById.set(entry.ingredient_id, [entry]);
  }

  const items: ShoppingItem[] = [];
  const inPantry: ShoppingItem[] = [];
  for (const acc of accs.values()) {
    foldIntoGrams(acc.bucket, acc.gpu);
    const entries = acc.ingredientId === null ? [] : (pantryById.get(acc.ingredientId) ?? []);
    const needed = amountsOf(acc.bucket);
    let pantry: PantryCoverage = 'none';
    let asNeeded = acc.asNeeded;
    if (entries.some((e) => e.quantity == null)) {
      pantry = 'covered';
    } else if (entries.length > 0) {
      const before = bucketSize(acc.bucket);
      let leftover = 0;
      for (const e of entries) leftover += subtractPantry(acc.bucket, e, acc.gpu);
      const after = bucketSize(acc.bucket);
      // Stock left after the measured amounts covers a "to taste" use; an empty or used-up
      // pantry entry does not.
      if (acc.asNeeded && leftover > EPSILON) asNeeded = false;
      if (after <= EPSILON && !asNeeded) pantry = 'covered';
      else if (after < before - EPSILON || asNeeded !== acc.asNeeded) pantry = 'partial';
    }
    const item: ShoppingItem = {
      key: acc.key,
      ingredientId: acc.ingredientId,
      name: acc.name,
      plural: acc.plural,
      aisle: acc.aisle,
      // A covered item still shows how much the plan uses, for the "already have" section.
      amounts: pantry === 'covered' ? needed : amountsOf(acc.bucket),
      asNeeded: pantry === 'covered' ? acc.asNeeded : asNeeded,
      recipeIds: [...acc.recipeIds].sort(),
      optional: acc.allOptional,
      staple: acc.staple,
      pantry,
    };
    if (pantry === 'covered') inPantry.push(item);
    else items.push(item);
  }
  items.sort(compareItems);
  inPantry.sort(compareItems);
  return { items, inPantry };
}

/** Group items by aisle in store-walk order. Items keep their sorted order within each group. */
export function groupByAisle(items: readonly ShoppingItem[]): AisleGroup[] {
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of [...items].sort(compareItems)) {
    const group = groups.get(item.aisle);
    if (group) group.push(item);
    else groups.set(item.aisle, [item]);
  }
  return [...groups.keys()]
    .sort(compareAisles)
    .map((aisle) => ({ aisle, title: aisleTitle(aisle), items: groups.get(aisle) ?? [] }));
}
