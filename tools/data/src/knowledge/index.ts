import type { IngredientDef } from './define.ts';
import { DAIRY } from './dairy.ts';
import { GRAINS } from './grains.ts';
import { LEGUMES_NUTS } from './legumesNuts.ts';
import { PANTRY } from './pantry.ts';
import { PRODUCE } from './produce.ts';
import { PROTEIN } from './protein.ts';

/** Every canonical ingredient Famara knows about, in a stable order. */
export const INGREDIENTS: readonly IngredientDef[] = [...PRODUCE, ...PROTEIN, ...DAIRY, ...GRAINS, ...LEGUMES_NUTS, ...PANTRY];

export const INGREDIENT_BY_ID: ReadonlyMap<string, IngredientDef> = new Map(INGREDIENTS.map((def) => [def.id, def]));
