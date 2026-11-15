/**
 * The ingredient checklist in cook mode, worded exactly as the recipe page words it: scaled to the
 * servings and portion size the recipe page was showing, in the person's unit system, with the
 * amount split from the name. Ticks stay keyed by the catalog line's position.
 */
import { lineWording, scaleRecipe } from '@/domain/portions';
import type { UnitSystem } from '@/domain/units';
import type { RecipeIngredientLine } from '@/lib/catalog';
import { intParam, stringParam, type RawParam } from '@/lib/params';

/** The recipe page's servings stepper range. */
const MAX_SERVINGS = 20;

/** The size cook mode was opened at, from the route; each part is absent when not given. */
export interface CookSize {
  servings?: number;
  /** Each serving is a half portion. Absent: follow the small-appetite setting. */
  halfPortions?: boolean;
}

/**
 * Reads `servings` and `portion` from the cook route, as the recipe page writes them. Anything
 * missing or malformed is left out, so cook mode falls back to the recipe and the setting.
 */
export function cookSizeFromParams(servings: RawParam, portion: RawParam): CookSize {
  const size: CookSize = {};
  const count = intParam(servings, 1, MAX_SERVINGS);
  if (count !== undefined) size.servings = count;
  const raw = stringParam(portion);
  if (raw === '0.5') size.halfPortions = true;
  if (raw === '1') size.halfPortions = false;
  return size;
}

export interface CookIngredient {
  /** The catalog line's position: what a tick is stored against. */
  readonly position: number;
  /** "2 tbsp", "1 knob"; null for lines without an amount ("Juice of one lime"). */
  readonly amount: string | null;
  readonly name: string;
  readonly optional: boolean;
  /** Amount and name read together, for VoiceOver. */
  readonly label: string;
}

export interface CookIngredientsInput {
  readonly lines: readonly RecipeIngredientLine[];
  /** Servings the catalog quantities make. */
  readonly baseServings: number;
  /** Servings being cooked. */
  readonly servings: number;
  /** Each serving is a half portion. */
  readonly smallAppetite: boolean;
  readonly system: UnitSystem;
}

/** Scaled with the same rounding and worded by the same rules as the recipe page's list. */
export function cookIngredients(input: CookIngredientsInput): CookIngredient[] {
  const scaled = scaleRecipe(
    {
      servings: input.baseServings,
      ingredients: input.lines.map((line) => ({ ...line, ingredient_id: line.ingredientId })),
    },
    input.servings,
    { smallAppetite: input.smallAppetite },
  );
  return scaled.lines.map((entry) => {
    const { amount, name } = lineWording(entry, input.system);
    const label = amount ? `${amount} ${name}` : name;
    return {
      position: entry.line.position,
      amount,
      name,
      optional: entry.line.optional,
      label: entry.line.optional ? `${label}, optional` : label,
    };
  });
}
