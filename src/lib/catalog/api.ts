import type { z } from 'zod';

import type { TermGroup } from './searchQuery';
import { readFirebaseCatalog } from '../firebase/catalog';
import { usesFirebase } from '../firebase/config';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/database.types';

export const CATALOG_STALE_TIME = 5 * 60_000;

type CatalogFunctions = Pick<
  Database['public']['Functions'],
  | 'catalog_cuisines'
  | 'catalog_ingredients'
  | 'catalog_meta'
  | 'catalog_recipe_detail'
  | 'catalog_recipes'
  | 'catalog_substitutions'
>;

export class CatalogError extends Error {
  constructor(
    readonly kind: 'query_failed' | 'bad_rows',
    cause: unknown,
  ) {
    super(
      kind === 'query_failed' ? 'Could not load the recipe catalog.' : 'Unexpected catalog data.',
      {
        cause,
      },
    );
    this.name = 'CatalogError';
  }
}

export async function readCatalog<Name extends keyof CatalogFunctions, Schema extends z.ZodType>(
  name: Name,
  args: CatalogFunctions[Name]['Args'],
  schema: Schema,
  groups?: readonly TermGroup[],
): Promise<z.output<Schema>> {
  let data: unknown;
  if (usesFirebase) {
    try {
      data = await readFirebaseCatalog(name, args, groups);
    } catch (error) {
      throw new CatalogError('query_failed', error);
    }
  } else {
    const response = await supabase.rpc(name, args);
    if (response.error) throw new CatalogError('query_failed', response.error);
    data = response.data;
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new CatalogError('bad_rows', parsed.error);
  return parsed.data;
}
