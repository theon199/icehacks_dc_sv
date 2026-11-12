/**
 * Catalog reads the onboarding questions need: which cuisines have recipes, and which ingredients
 * count as pantry staples. Both come from the bundled catalog (docs/DATA.md).
 *
 * These go straight to the catalog connection until the typed catalog query module is available;
 * switching to it is a change to this file only.
 */
import { z } from 'zod';

import { catalogQuery } from '@/lib/db/catalog';

export interface CuisineOption {
  /** Catalog cuisine id, e.g. `west_african`. */
  id: string;
  /** Catalog region id, e.g. `sub_saharan_africa`. */
  region: string;
  recipeCount: number;
}

export interface PantryStaple {
  /** Catalog ingredient id, e.g. `olive_oil`. */
  id: string;
  name: string;
  category: string;
}

const cuisineRow = z.object({
  id: z.string().min(1),
  region: z.string().min(1),
  recipeCount: z.number().int().nonnegative(),
});

const stapleRow = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
});

/** Every cuisine with at least one recipe, with its region. */
export async function loadCuisineOptions(): Promise<CuisineOption[]> {
  return catalogQuery(
    `SELECT cuisine AS id, region, COUNT(*) AS recipeCount
       FROM recipes
      GROUP BY cuisine, region
      ORDER BY cuisine`,
    [],
    cuisineRow,
  );
}

/** Ingredients most kitchens already have, offered as a quick start for the pantry. */
export async function loadPantryStaples(): Promise<PantryStaple[]> {
  return catalogQuery(
    `SELECT id, name, category
       FROM ingredients
      WHERE pantry_staple = 1
      ORDER BY category, name`,
    [],
    stapleRow,
  );
}
