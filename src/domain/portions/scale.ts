/**
 * Scaling a recipe to a number of servings, including small-appetite half portions.
 *
 * Linear scaling is right for flour and stock but wrong for eggs and tortillas: nobody cracks half
 * an egg. Count-based lines are rounded to amounts a cook can actually use, and tiny measured
 * amounts are held at a usable minimum so a pinch of salt never scales to nothing.
 */
import { toBase, UNITS, normalizeUnit, type UnitId } from '../units';

/** One ingredient line, shaped like a `recipe_ingredients` row (see docs/DATA.md). */
export interface PortionLine {
  readonly ingredient_id: string | null;
  readonly text: string;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly grams?: number | null | undefined;
  readonly optional?: boolean | number | null | undefined;
}

export interface PortionRecipe<L extends PortionLine = PortionLine> {
  /** How many servings the recipe's quantities make. */
  readonly servings: number;
  readonly ingredients: readonly L[];
}

/** How a count line may be divided. */
export type Divisibility = 'whole' | 'half' | 'free';

export interface ScaleOptions {
  /** Small appetite mode: every serving is a half portion. */
  readonly smallAppetite?: boolean;
  /** Override how an ingredient's count can be split. Defaults to `defaultDivisibility`. */
  readonly divisibility?: (ingredientId: string | null, unit: UnitId | null) => Divisibility;
}

export interface ScaledLine<L extends PortionLine = PortionLine> {
  readonly line: L;
  /** Quantity after scaling and rounding; `null` when the line had no quantity ("to taste"). */
  readonly quantity: number | null;
  readonly unit: UnitId | null;
  /** Weight after scaling, kept proportional to the rounded quantity. */
  readonly grams: number | null;
  /** Exact linear quantity before rounding, for "about" hints. */
  readonly exactQuantity: number | null;
  /** True when rounding or a minimum moved the amount by more than 10%. */
  readonly adjusted: boolean;
}

export interface ScaledRecipe<L extends PortionLine = PortionLine> {
  readonly servings: number;
  /** Size of one serving relative to a standard one: 0.5 in small appetite mode. */
  readonly portion: number;
  /** Multiplier applied to every line before rounding. */
  readonly factor: number;
  readonly lines: readonly ScaledLine<L>[];
}

// Ingredients that come in one piece and do not keep once opened or cut.
const WHOLE_ITEM_WORDS = [
  'egg',
  'tortilla',
  'pita',
  'bun',
  'roll',
  'bagel',
  'wrap',
  'naan',
  'roti',
  'chapati',
  'flatbread',
  'muffin',
  'taco',
  'cracker',
  'sausage',
  'patty',
  'bread',
  'tea_bag',
  'bouillon',
  'stock_cube',
];

/** Count units that are always whole: you buy and use a can, a slice, a clove, a stick. */
const WHOLE_UNITS: ReadonlySet<UnitId> = new Set<UnitId>([
  'can',
  'slice',
  'clove',
  'package',
  'sprig',
  'leaf',
  'stalk',
  'stick',
  'bunch',
  'head',
  'handful',
]);

/**
 * Default rule for splitting counted ingredients: whole-item foods (eggs, tortillas, buns …) and
 * whole-only units (cans, cloves …) round to whole numbers; other counted produce (an onion, a lemon,
 * an avocado) may be halved. Measured units (volume, mass) are split freely.
 */
export function defaultDivisibility(
  ingredientId: string | null,
  unit: UnitId | null,
): Divisibility {
  if (unit !== null && UNITS[unit].dimension !== 'count') return 'free';
  if (unit !== null && WHOLE_UNITS.has(unit)) return 'whole';
  const id = (ingredientId ?? '').toLowerCase();
  if (WHOLE_ITEM_WORDS.some((w) => id === w || id.startsWith(`${w}_`) || id.endsWith(`_${w}`))) {
    return 'whole';
  }
  if (/(^|_)eggs?($|_)/.test(id)) return 'whole';
  return 'half';
}

/** Smallest amount worth writing down: ⅛ tsp for volumes, 1 g for weights. */
const MIN_VOLUME_ML = UNITS.tsp.base / 8;
const MIN_MASS_G = 1;

function roundCount(value: number, step: number): number {
  // Never round a needed item to zero: one egg is the least an egg dish can use.
  return Math.max(step, Math.round(value / step) * step);
}

function scaleLine<L extends PortionLine>(
  line: L,
  factor: number,
  divisibility: NonNullable<ScaleOptions['divisibility']>,
): ScaledLine<L> {
  const unit = normalizeUnit(line.unit);
  const grams = line.grams ?? null;
  if (line.quantity == null || !Number.isFinite(line.quantity) || line.quantity <= 0) {
    return {
      line,
      quantity: null,
      unit,
      grams: grams === null ? null : grams * factor,
      exactQuantity: null,
      adjusted: false,
    };
  }
  const exact = line.quantity * factor;
  let rounded = exact;
  const dimension = unit === null ? 'count' : UNITS[unit].dimension;
  if (dimension === 'count') {
    const rule = divisibility(line.ingredient_id, unit);
    if (rule === 'whole') rounded = roundCount(exact, 1);
    else if (rule === 'half') rounded = roundCount(exact, 0.5);
  } else if (unit !== null) {
    const base = toBase(exact, unit);
    const min = dimension === 'volume' ? MIN_VOLUME_ML : MIN_MASS_G;
    if (base < min) rounded = min / UNITS[unit].base;
  }
  const ratio = rounded / line.quantity;
  return {
    line,
    quantity: rounded,
    unit,
    grams: grams === null ? null : grams * ratio,
    exactQuantity: exact,
    adjusted: Math.abs(rounded - exact) > exact * 0.1,
  };
}

/**
 * Scale `recipe` to `servings` servings. With `smallAppetite`, each serving is a half portion, so
 * two small-appetite servings use the same ingredients as one standard serving (before rounding).
 */
export function scaleRecipe<L extends PortionLine>(
  recipe: PortionRecipe<L>,
  servings: number,
  options: ScaleOptions = {},
): ScaledRecipe<L> {
  const base = recipe.servings > 0 && Number.isFinite(recipe.servings) ? recipe.servings : 1;
  const wanted = Number.isFinite(servings) && servings > 0 ? servings : base;
  const portion = options.smallAppetite ? 0.5 : 1;
  const factor = (wanted * portion) / base;
  const divisibility = options.divisibility ?? defaultDivisibility;
  return {
    servings: wanted,
    portion,
    factor,
    lines: recipe.ingredients.map((line) => scaleLine(line, factor, divisibility)),
  };
}

/** The same number of servings, each a half portion. */
export function halfPortion<L extends PortionLine>(
  recipe: PortionRecipe<L>,
  options: Omit<ScaleOptions, 'smallAppetite'> = {},
): ScaledRecipe<L> {
  return scaleRecipe(recipe, recipe.servings, { ...options, smallAppetite: true });
}

/** Multiply per-serving nutrition by a portion size, keeping missing values missing. */
export function scaleNutrition<N extends Readonly<Record<string, number | null | undefined>>>(
  perServing: N,
  portion: number,
): { [K in keyof N]: number | null } {
  const out = {} as { [K in keyof N]: number | null };
  for (const key of Object.keys(perServing) as (keyof N)[]) {
    const v = perServing[key];
    out[key] = typeof v === 'number' && Number.isFinite(v) ? v * portion : null;
  }
  return out;
}
