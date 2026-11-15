import { useMemo } from 'react';

import { useRecipes, type RecipeSummary } from '@/lib/catalog';

import { WELCOME_RECIPE_IDS, type ChefExample } from './welcomeContent';

/** A catalog recipe as the welcome tiles show it. */
export interface WelcomeRecipe {
  id: string;
  name: string;
  /** Null when the catalog has no total time; time captions are then left out. */
  totalMinutes: number | null;
  /** Null when the catalog has no protein figure; protein captions are then left out. */
  proteinGrams: number | null;
  imageUrl: string;
  summary: RecipeSummary;
}

export type WelcomeRecipeBook = ReadonlyMap<string, WelcomeRecipe>;

const EMPTY_BOOK: WelcomeRecipeBook = new Map();

/** Catalog summaries the carousel can show: only those with a photo. */
export function toWelcomeBook(summaries: readonly RecipeSummary[]): WelcomeRecipeBook {
  const book = new Map<string, WelcomeRecipe>();
  for (const summary of summaries) {
    if (!summary.imageUrl) continue;
    const protein = summary.nutrition?.proteinG;
    book.set(summary.id, {
      id: summary.id,
      name: summary.title,
      totalMinutes: summary.totalMinutes,
      proteinGrams: typeof protein === 'number' && Number.isFinite(protein) ? protein : null,
      imageUrl: summary.imageUrl,
      summary,
    });
  }
  return book;
}

/** The ids from `ids` the book can show, in order; protein tiles need a protein figure. */
export function availableIds(
  book: WelcomeRecipeBook,
  ids: readonly string[],
  options: { requireProtein?: boolean } = {},
): string[] {
  return ids.filter((id) => {
    const recipe = book.get(id);
    if (!recipe) return false;
    return options.requireProtein ? recipe.proteinGrams !== null : true;
  });
}

/** An example's answers that the catalog confirms really meet the request. */
export function confirmedAnswers(book: WelcomeRecipeBook, example: ChefExample): string[] {
  return example.answers.filter((id) => {
    const recipe = book.get(id);
    return recipe !== undefined && example.fits(recipe.summary);
  });
}

/** "15g", "14.5g": whole grams stay whole, anything else keeps one decimal. */
export function formatGrams(grams: number): string {
  const rounded = Math.round(grams * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}g`;
}

/** The carousel's recipes from the bundled catalog; empty until the read finishes. */
export function useWelcomeRecipes(): WelcomeRecipeBook {
  const { data } = useRecipes(WELCOME_RECIPE_IDS);
  return useMemo(() => (data ? toWelcomeBook(data) : EMPTY_BOOK), [data]);
}
