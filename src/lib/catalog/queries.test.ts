import { CATALOG_SCHEMA_VERSION, resetCatalogForTests } from '../db/catalog';
import { describeCatalogDb, stats } from './__fixtures__/nodeCatalogDb';
import {
  clearCatalogCaches,
  getCatalogMeta,
  getCuisines,
  getIngredients,
  getPantryStaples,
  getRecipeDetail,
  getRecipesByFamily,
  getRecipeSummaries,
  getRecipeSummary,
  getSubstitutions,
  listCandidates,
  SEARCH_PAGE_SIZE,
  searchIngredients,
  searchRecipes,
} from './queries';
import { ALLERGEN_IDS, DietFlag, dietMask, satisfiesDiets, type AllergenId } from './types';

jest.mock(
  'expo-sqlite',
  () => jest.requireActual('./__fixtures__/nodeCatalogDb').expoSqliteFake as unknown,
);
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ hash: 'feedc0ffee00' }) } }));

beforeEach(() => {
  resetCatalogForTests();
  clearCatalogCaches();
});

describeCatalogDb('recipe summaries', () => {
  it('maps a row into a typed summary with parsed JSON columns', async () => {
    const recipe = await getRecipeSummary('mealdb:52764');
    expect(recipe).toMatchObject({
      id: 'mealdb:52764',
      course: 'main',
      cuisine: 'greek',
      nutritionConfidence: 'estimated',
      gentle: false,
    });
    expect(recipe?.allergens.milk).toBe('contains');
    expect(recipe?.allergens.peanut).toBe('free');
    expect(Object.keys(recipe?.allergens ?? {}).sort()).toEqual([...ALLERGEN_IDS].sort());
    expect(recipe?.goalTags).toContain('high_protein');
    expect(recipe?.nutrition?.proteinG).toBeGreaterThan(0);
  });

  it('passes unknown allergen statuses through untouched', async () => {
    const recipe = await getRecipeSummary('mealdb:52765');
    expect(recipe?.allergens.egg).toBe('unknown');
    expect(recipe?.allergens.wheat).toBe('contains');
  });

  it('surfaces nutrition confidence none with no nutrition values', async () => {
    const rows = await searchRecipes('', {}, 0);
    expect(rows.items.length).toBeGreaterThan(0);
    const candidates = await listCandidates({ limit: 2000 });
    const none = candidates.filter((c) => c.nutritionConfidence === 'none');
    expect(none.length).toBeGreaterThan(0);
    for (const recipe of none) expect(recipe.nutrition).toBeNull();
    for (const recipe of candidates.filter((c) => c.nutritionConfidence !== 'none')) {
      expect(recipe.nutrition).not.toBeNull();
    }
  });

  it('batches lookups, keeps the requested order and skips unknown ids', async () => {
    const summaries = await getRecipeSummaries(['mealdb:52765', 'nope', 'mealdb:52764']);
    expect(summaries.map((s) => s.id)).toEqual(['mealdb:52765', 'mealdb:52764']);
    await expect(getRecipeSummary('missing:1')).resolves.toBeNull();
  });

  it('serves repeated lookups from cache without touching SQLite', async () => {
    await getRecipeSummaries(['mealdb:52764', 'mealdb:52765']);
    const before = stats.executed;
    await getRecipeSummaries(['mealdb:52765', 'mealdb:52764']);
    expect(stats.executed).toBe(before);
  });

  it('reuses one prepared statement for the same query shape', async () => {
    const before = stats.prepared;
    await getRecipeSummary('mealdb:52764');
    await getRecipeSummary('mealdb:52765');
    await getRecipeSummaries(['mealdb:52766', 'mealdb:52767', 'mealdb:52768']);
    expect(stats.prepared - before).toBe(1);
  });

  it('keeps cached rows that a full cache evicts while the same batch loads', async () => {
    const ids = (await listCandidates({ limit: 2000 })).map((c) => c.id);
    expect(ids.length).toBeGreaterThan(601);
    await getRecipeSummaries(ids.slice(0, 600));
    const oldest = ids[0] as string;
    const fresh = ids[600] as string;
    const summaries = await getRecipeSummaries([oldest, fresh]);
    expect(summaries.map((s) => s.id)).toEqual([oldest, fresh]);
  });

  it('returns every row of a batch larger than the cache', async () => {
    const ids = (await listCandidates({ limit: 2000 })).map((c) => c.id);
    expect(ids.length).toBeGreaterThan(600);
    const summaries = await getRecipeSummaries(ids);
    expect(summaries.map((s) => s.id)).toEqual(ids);
  });
});

describeCatalogDb('recipe detail', () => {
  it('returns ordered ingredients, steps and tutorials', async () => {
    const detail = await getRecipeDetail('mealdb:52764');
    expect(detail?.ingredients.length).toBeGreaterThan(3);
    expect(detail?.ingredients[0]).toMatchObject({ position: 1, ingredientId: 'shrimp' });
    const positions = detail?.steps.map((s) => s.position) ?? [];
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(detail?.steps[0]?.timerSeconds).toBe(300);
    expect(detail?.tutorials[0]?.kind).toBe('video');
  });

  it('returns null for an unknown recipe', async () => {
    await expect(getRecipeDetail('missing:1')).resolves.toBeNull();
  });
});

describeCatalogDb('listCandidates', () => {
  it('requires every diet bit in the mask', async () => {
    const mask = dietMask(['vegetarian', 'dairy_free']);
    expect(mask).toBe(DietFlag.vegetarian | DietFlag.dairy_free);
    const found = await listCandidates({ dietMask: mask, limit: 500 });
    expect(found).not.toHaveLength(0);
    const misfits = found.filter((recipe) => !satisfiesDiets(recipe.dietFlags, mask));
    expect(misfits).toEqual([]);
  });

  it('never carries a diet bit that the allergen statuses cannot back up', async () => {
    const requirements: [number, readonly AllergenId[]][] = [
      [DietFlag.vegan, ['milk', 'egg', 'fish', 'shellfish']],
      [DietFlag.vegetarian, ['fish', 'shellfish']],
      [DietFlag.dairy_free, ['milk']],
      [DietFlag.gluten_free, ['gluten', 'wheat']],
    ];
    const all = await listCandidates({ limit: 2000 });
    const contradictions = all.flatMap((recipe) =>
      requirements
        .filter(([bit]) => satisfiesDiets(recipe.dietFlags, bit))
        .flatMap(([bit, allergens]) =>
          allergens
            .filter((allergen) => recipe.allergens[allergen] !== 'free')
            .map((allergen) => `${recipe.id}: diet ${bit} with ${allergen}`),
        ),
    );
    expect(contradictions).toEqual([]);
    expect(all.some((recipe) => satisfiesDiets(recipe.dietFlags, DietFlag.vegetarian))).toBe(true);
  });

  it('keeps only recipes that are explicitly free of avoided allergens', async () => {
    const found = await listCandidates({ avoidAllergens: ['milk', 'egg'], limit: 2000 });
    expect(found).not.toHaveLength(0);
    const statuses = new Set(
      found.flatMap((recipe) => [recipe.allergens.milk, recipe.allergens.egg]),
    );
    expect([...statuses]).toEqual(['free']);
    // This recipe has no egg line but its egg status is unknown, so fail-closed leaves it out.
    expect(found.some((recipe) => recipe.id === 'mealdb:52765')).toBe(false);
  });

  it('filters by cuisine, course, time and gentle, and orders by health score', async () => {
    const found = await listCandidates({
      cuisines: ['italian', 'greek'],
      course: ['main', 'soup'],
      maxMinutes: 60,
      limit: 100,
    });
    expect(found).not.toHaveLength(0);
    expect(
      found.every((recipe) => recipe.cuisine === 'italian' || recipe.cuisine === 'greek'),
    ).toBe(true);
    expect(found.every((recipe) => recipe.course === 'main' || recipe.course === 'soup')).toBe(
      true,
    );
    // An unknown total time never passes a time limit.
    expect(found.every((recipe) => recipe.totalMinutes !== null && recipe.totalMinutes <= 60)).toBe(
      true,
    );
    const scores = found.map((recipe) => recipe.healthScore);
    const climbs = scores.filter((score, i) => i > 0 && score > (scores[i - 1] ?? Infinity));
    expect(climbs).toEqual([]);

    const gentle = await listCandidates({ gentle: true, limit: 50 });
    expect(gentle.filter((recipe) => !recipe.gentle)).toEqual([]);
  });

  it('includes matched ingredient ids and honours limit and exclusions', async () => {
    const [top] = await listCandidates({ limit: 1 });
    expect(top).toBeDefined();
    expect(top?.ingredientIds).not.toHaveLength(0);
    const rest = await listCandidates({ limit: 5, excludeIds: [top?.id ?? ''] });
    expect(rest).toHaveLength(5);
    expect(rest.some((recipe) => recipe.id === top?.id)).toBe(false);
  });
});

describeCatalogDb('core ingredients', () => {
  it('leave out pantry staples and optional lines', async () => {
    // Thirteen lines: five pantry staples and one optional line among them.
    const [candidate] = await listCandidates({ limit: 2000 }).then((all) =>
      all.filter((c) => c.id === 'medlineplus:apple-bars'),
    );
    const detail = await getRecipeDetail('medlineplus:apple-bars');
    if (!candidate || !detail) throw new Error('fixture recipe missing from the catalog');
    const ingredients = new Map(
      (await getIngredients(candidate.ingredientIds)).map((i) => [i.id, i] as const),
    );

    const staples = candidate.ingredientIds.filter((id) => ingredients.get(id)?.pantryStaple);
    const optional = detail.ingredients.filter((line) => line.optional).map((l) => l.ingredientId);
    expect(staples.length).toBeGreaterThan(0);
    expect(optional.length).toBeGreaterThan(0);

    expect(candidate.coreIngredientIds.length).toBeGreaterThan(0);
    for (const id of [...staples, ...optional])
      expect(candidate.coreIngredientIds).not.toContain(id);
    expect(candidate.coreIngredientIds).toEqual(
      candidate.ingredientIds.filter((id) => !staples.includes(id) && !optional.includes(id)),
    );
  });

  it('are distinct, a subset of the matched ids, and never a staple anywhere in the catalog', async () => {
    const candidates = await listCandidates({ limit: 2000 });
    const staples = new Set((await getPantryStaples()).map((i) => i.id));
    for (const c of candidates) {
      expect(new Set(c.coreIngredientIds).size).toBe(c.coreIngredientIds.length);
      for (const id of c.coreIngredientIds) {
        expect(c.ingredientIds).toContain(id);
        expect(staples.has(id)).toBe(false);
      }
    }
    // Staples still count as matched ingredients; only the core list leaves them out.
    expect(candidates.some((c) => c.ingredientIds.some((id) => staples.has(id)))).toBe(true);
  });
});

describeCatalogDb('getPantryStaples', () => {
  it('returns only pantry staples, grouped by category', async () => {
    const staples = await getPantryStaples();
    expect(staples.length).toBeGreaterThan(0);
    for (const staple of staples) expect(staple.pantryStaple).toBe(true);
    const ids = staples.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['salt', 'olive_oil']));
    expect(ids).not.toContain('chickpea');
    expect([...new Set(ids)]).toEqual(ids);
    const categories = staples.map((s) => s.category);
    expect(categories).toEqual([...categories].sort());
  });

  it('reads once and hands every caller its own list', async () => {
    const first = await getPantryStaples();
    const before = stats.executed;
    first.length = 0;
    const second = await getPantryStaples();
    expect(stats.executed).toBe(before);
    expect(second.length).toBeGreaterThan(0);
  });
});

describeCatalogDb('getRecipesByFamily', () => {
  it('returns every version of a dish, healthiest first', async () => {
    const family = await getRecipesByFamily('fam:meatball');
    expect(family.map((r) => r.id).sort()).toEqual([
      'medlineplus:baked-meatballs',
      'medlineplus:easy-meatballs',
    ]);
    for (const recipe of family) expect(recipe.familyId).toBe('fam:meatball');
    const scores = family.map((r) => r.healthScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('applies allergen filters fail-closed', async () => {
    // One version contains wheat, the other is free of it.
    const all = await getRecipesByFamily('fam:pepper-salt-squid');
    expect(all).toHaveLength(2);
    const safe = await getRecipesByFamily('fam:pepper-salt-squid', { avoidAllergens: ['wheat'] });
    expect(safe.map((r) => r.id)).toEqual(['mealdb:53108']);
    // An unknown status is treated as unsafe, never as free.
    const unknown = await getRecipesByFamily('fam:chicken-spanish', { avoidAllergens: ['milk'] });
    expect(unknown.map((r) => r.id)).toEqual(['mealdb:53164']);
  });

  it('keeps only the versions that carry every diet bit in the mask', async () => {
    const spanish = await getRecipesByFamily('fam:chicken-spanish');
    expect(spanish.map((r) => r.id).sort()).toEqual(['mealdb:53143', 'mealdb:53164']);
    const dairyFree = await getRecipesByFamily('fam:chicken-spanish', {
      dietMask: DietFlag.dairy_free,
    });
    expect(dairyFree.map((r) => r.id)).toEqual(['mealdb:53164']);

    // The other version serves its pudding with store-bought ice cream, whose fish and shellfish
    // status is unknown, so only this one is vegetarian.
    const pudding = await getRecipesByFamily('fam:pudding-sticky-toffee');
    expect(pudding.map((r) => r.id).sort()).toEqual(['mealdb:52793', 'mealdb:52883']);
    const vegetarian = await getRecipesByFamily('fam:pudding-sticky-toffee', {
      dietMask: DietFlag.vegetarian,
    });
    expect(vegetarian.map((r) => r.id)).toEqual(['mealdb:52883']);

    // A mask needs every bit: neither version is both vegetarian and dairy-free.
    await expect(
      getRecipesByFamily('fam:pudding-sticky-toffee', {
        dietMask: DietFlag.vegetarian | DietFlag.dairy_free,
      }),
    ).resolves.toEqual([]);
  });

  it('returns nothing for an unknown family', async () => {
    await expect(getRecipesByFamily('fam:does-not-exist')).resolves.toEqual([]);
  });
});

describeCatalogDb('searchRecipes', () => {
  it('ranks title matches first using prefix matching', async () => {
    const page = await searchRecipes('chick curr');
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0]?.title.toLowerCase()).toMatch(/chick/);
    expect(page.items[0]?.title.toLowerCase()).toMatch(/curr/);
  });

  it('expands regional ingredient names', async () => {
    const [aubergine, eggplant] = await Promise.all([
      searchRecipes('aubergine'),
      searchRecipes('eggplant'),
    ]);
    expect(eggplant.items.length).toBeGreaterThan(0);
    const auberIds = new Set(aubergine.items.map((r) => r.id));
    for (const r of eggplant.items) expect(auberIds.has(r.id)).toBe(true);

    const garbanzo = await searchRecipes('garbanzo');
    expect(garbanzo.items.length).toBeGreaterThan(0);
    const pak = await searchRecipes('pak choi');
    expect(pak.items.length).toBeGreaterThan(0);
  });

  it.each([
    '"',
    'chicken"',
    '"); DROP TABLE recipes; --',
    'NEAR(chicken curry)',
    'title:chicken',
    'chicken AND OR NOT',
    '*',
    '^chicken',
    '(((',
    'crème brûlée',
    '🍕 pizza',
    '-',
    'a'.repeat(500),
  ])('never throws for hostile input %p', async (input) => {
    await expect(searchRecipes(input)).resolves.toEqual(
      expect.objectContaining({ items: expect.any(Array) }),
    );
  });

  it('pages with a cursor until the last page', async () => {
    const first = await searchRecipes('chicken');
    expect(first.items).toHaveLength(SEARCH_PAGE_SIZE);
    expect(first.nextCursor).toBe(SEARCH_PAGE_SIZE);
    const second = await searchRecipes('chicken', {}, first.nextCursor);
    const overlap = second.items.filter((r) => first.items.some((f) => f.id === r.id));
    expect(overlap).toHaveLength(0);
    const tiny = await searchRecipes('chicken', { cuisines: ['greek'] });
    expect(tiny.nextCursor).toBeNull();
  });

  it('applies filters to text search and browses when the query is empty', async () => {
    const filtered = await searchRecipes('chicken', {
      course: 'main',
      maxKcal: 500,
      goals: ['high_protein'],
      avoidAllergens: ['peanut'],
    });
    for (const r of filtered.items) {
      expect(r.course).toBe('main');
      expect(r.nutrition?.kcal ?? Infinity).toBeLessThanOrEqual(500);
      expect(r.goalTags).toContain('high_protein');
      expect(r.allergens.peanut).toBe('free');
    }
    const browse = await searchRecipes('   ', { dietMask: DietFlag.vegan });
    expect(browse.items.length).toBeGreaterThan(0);
    for (const r of browse.items) expect(satisfiesDiets(r.dietFlags, DietFlag.vegan)).toBe(true);
  });
});

describeCatalogDb('ingredients and substitutions', () => {
  it('fetches ingredients by id with parsed fields', async () => {
    const [onion, missing] = await getIngredients(['onion', 'nope']);
    expect(missing).toBeUndefined();
    expect(onion).toMatchObject({ id: 'onion', category: 'produce', pantryStaple: true });
    expect(onion?.gramsPerUnit.cup).toBe(160);
    expect(onion?.allergens).toEqual([]);
  });

  it('keeps every ingredient of a batch whatever the cache holds', async () => {
    const candidates = await listCandidates({ limit: 2000 });
    const ids = [...new Set(candidates.flatMap((c) => c.ingredientIds))];
    expect(ids.length).toBeGreaterThan(401);
    await getIngredients(ids.slice(0, 400));
    const oldest = ids[0] as string;
    const fresh = ids[400] as string;
    expect((await getIngredients([oldest, fresh])).map((i) => i.id)).toEqual([oldest, fresh]);

    clearCatalogCaches();
    expect((await getIngredients(ids)).map((i) => i.id)).toEqual(ids);
  });

  it('finds ingredients by name, plural and synonym, exact matches first', async () => {
    const onions = await searchIngredients('onion');
    expect(onions[0]?.id).toBe('onion');
    const zucchini = await searchIngredients('courgette');
    expect(zucchini.map((i) => i.id)).toContain('zucchini');
    await expect(searchIngredients('%_')).resolves.toEqual([]);
    await expect(searchIngredients('   ')).resolves.toEqual([]);
  });

  it('returns substitutions for ingredients, optionally by goal', async () => {
    const all = await getSubstitutions(['sour_cream', 'heavy_cream']);
    expect(all.length).toBeGreaterThan(1);
    const satFat = await getSubstitutions(['sour_cream', 'heavy_cream'], ['lower_sat_fat']);
    expect(satFat.length).toBeGreaterThan(0);
    for (const s of satFat) expect(s.goal).toBe('lower_sat_fat');
    await expect(getSubstitutions([])).resolves.toEqual([]);
  });
});

describeCatalogDb('catalog metadata', () => {
  it('lists cuisines with counts and reads build info', async () => {
    const cuisines = await getCuisines();
    expect(cuisines[0]?.recipeCount).toBeGreaterThanOrEqual(cuisines[1]?.recipeCount ?? 0);
    expect(cuisines.find((c) => c.cuisine === 'greek')?.region).toBe('southern_europe');
    const meta = await getCatalogMeta();
    expect(meta.schemaVersion).toBe(CATALOG_SCHEMA_VERSION);
    expect(meta.schemaVersion).toBe(2);
    expect(meta.recipeCount).toBeGreaterThan(0);
  });
});
