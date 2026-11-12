import type { RecipeSummary } from '@/lib/catalog';
import type { ChefMessage } from '@/stores';

import { buildChefRequest, gatherCandidates, type CatalogAccess } from './request';
import { answeredPrefs, recipe } from '../__fixtures__/recipe';

function fakeCatalog(pool: RecipeSummary[], matches: Record<string, RecipeSummary[]> = {}) {
  const access = {
    listCandidates: jest.fn(async () => pool),
    searchRecipes: jest.fn(async (query: string) => ({
      items: matches[query] ?? [],
      nextCursor: null,
    })),
  } satisfies CatalogAccess;
  return access;
}

const question = (text: string): ChefMessage => ({
  id: 'q1',
  role: 'user',
  text,
  at: '2026-11-11T10:00:00.000Z',
  recipeIds: [],
});

describe('gatherCandidates', () => {
  it('looks nothing up before the allergen question is answered', async () => {
    const catalog = fakeCatalog([recipe('p:1')]);
    const prefs = answeredPrefs({ allergensAnswered: false });
    await expect(gatherCandidates('lentil soup', prefs, catalog)).resolves.toEqual([]);
    expect(catalog.listCandidates).not.toHaveBeenCalled();
    expect(catalog.searchRecipes).not.toHaveBeenCalled();
  });

  it('filters in SQL and again locally, with question matches first', async () => {
    const vegetarian = 1;
    const catalog = fakeCatalog(
      [
        recipe('p:1', { dietFlags: vegetarian }),
        recipe('p:peanut', { dietFlags: vegetarian, allergens: { peanut: 'contains' } }),
        recipe('p:meat', { dietFlags: 0 }),
      ],
      { lentil: [recipe('m:lentil', { dietFlags: vegetarian })] },
    );
    const prefs = answeredPrefs({ allergens: ['peanut'], diets: ['vegetarian'] });
    const picked = await gatherCandidates('lentil soup', prefs, catalog);
    expect(picked.map((r) => r.id)).toEqual(['m:lentil', 'p:1']);
    expect(catalog.listCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ avoidAllergens: ['peanut'], excludeDietMask: vegetarian }),
    );
    expect(catalog.searchRecipes).toHaveBeenCalledWith(
      'lentil',
      expect.objectContaining({ avoidAllergens: ['peanut'], dietMask: vegetarian }),
    );
  });

  it('still answers when the catalog fails', async () => {
    const catalog: CatalogAccess = {
      listCandidates: () => Promise.reject(new Error('db closed')),
      searchRecipes: () => Promise.reject(new Error('db closed')),
    };
    await expect(gatherCandidates('lentil soup', answeredPrefs(), catalog)).resolves.toEqual([]);
  });
});

describe('buildChefRequest', () => {
  it('sends the thread, a profile summary, the screened candidates and the photo', async () => {
    const catalog = fakeCatalog([recipe('p:1')]);
    const prefs = answeredPrefs({
      cuisines: ['thai'],
      goals: ['more_protein'],
      allergens: ['sesame'],
      maxMinutes: 2,
      smallAppetite: true,
      displayName: 'Private Name',
    });
    const built = await buildChefRequest([question('Dinner idea?')], prefs, catalog, 'BASE64');
    expect(built?.request).toEqual({
      messages: [{ role: 'user', content: 'Dinner idea?' }],
      profile: {
        cuisines: ['thai'],
        diet: [],
        allergens: ['sesame'],
        goals: ['more_protein'],
        time_budget_minutes: 5,
        small_appetite: true,
      },
      candidates: [expect.objectContaining({ id: 'p:1' })],
      image: 'BASE64',
    });
    expect(JSON.stringify(built?.request)).not.toContain('Private Name');
  });

  it('builds nothing when the last turn is not a question', async () => {
    const answer = { ...question('Here you go'), role: 'assistant' as const };
    await expect(buildChefRequest([answer], answeredPrefs(), fakeCatalog([]))).resolves.toBeNull();
  });
});
