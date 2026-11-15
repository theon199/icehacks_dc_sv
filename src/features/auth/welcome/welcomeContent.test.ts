/**
 * The carousel's picks checked against the real bundled catalog: every dish exists with a photo,
 * protein tiles have a protein figure, and every Chef example's answers really meet the request.
 */
import { getRecipeSummaries } from '@/lib/catalog';
import { describeCatalogDb } from '@/lib/catalog/__fixtures__/nodeCatalogDb';

import {
  CHEF_EXAMPLES,
  FOR_YOU_POOL,
  PLAN_MEALS,
  SWIPE_FIRST_SAVED,
  SWIPE_POOL,
  WELCOME_RECIPE_IDS,
} from './welcomeContent';
import { availableIds, confirmedAnswers, toWelcomeBook } from './welcomeRecipes';

jest.mock('@/lib/supabase/client', () => ({
  supabase: jest.requireActual('@/lib/catalog/__fixtures__/nodeCatalogDb').catalogSupabaseFake,
}));

describeCatalogDb('welcome carousel picks', () => {
  it('finds every dish in the catalog, with a photo', async () => {
    const book = toWelcomeBook(await getRecipeSummaries(WELCOME_RECIPE_IDS));
    expect([...book.keys()].sort()).toEqual([...WELCOME_RECIPE_IDS].sort());
    expect(book.has(SWIPE_FIRST_SAVED)).toBe(true);
    expect(availableIds(book, SWIPE_POOL)).toEqual(SWIPE_POOL);
    expect(availableIds(book, PLAN_MEALS)).toEqual(PLAN_MEALS);
  });

  it('only puts dishes with a protein figure on the protein tiles', async () => {
    const book = toWelcomeBook(await getRecipeSummaries(WELCOME_RECIPE_IDS));
    expect(availableIds(book, FOR_YOU_POOL, { requireProtein: true })).toEqual(FOR_YOU_POOL);
  });

  it('answers every Chef example with dishes that meet it', async () => {
    const book = toWelcomeBook(await getRecipeSummaries(WELCOME_RECIPE_IDS));
    for (const example of CHEF_EXAMPLES) {
      expect(confirmedAnswers(book, example)).toEqual([...example.answers]);
    }
  });
});
