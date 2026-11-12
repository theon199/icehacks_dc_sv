import { resetCatalogForTests } from '../db/catalog';
import { nodeSqliteAvailable, stats } from './__fixtures__/nodeCatalogDb';
import {
  clearCatalogCaches,
  getCatalogMeta,
  getCuisines,
  getIngredients,
  getRecipeDetail,
  getRecipeSummaries,
  getRecipeSummary,
  getSubstitutions,
  listCandidates,
  SEARCH_PAGE_SIZE,
  searchIngredients,
  searchRecipes,
} from './queries';
import { ALLERGEN_IDS, DietFlag, dietMask, satisfiesDiets } from './types';

jest.mock(
  'expo-sqlite',
  () => jest.requireActual('./__fixtures__/nodeCatalogDb').expoSqliteFake as unknown,
);
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ hash: 'feedc0ffee00' }) } }));

const describeDb = nodeSqliteAvailable ? describe : describe.skip;

beforeEach(() => {
  resetCatalogForTests();
  clearCatalogCaches();
});

describeDb('recipe summaries', () => {
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
});

describeDb('recipe detail', () => {
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

describeDb('listCandidates', () => {
  it('requires every diet bit in the mask', async () => {
    const mask = dietMask(['vegetarian', 'dairy_free']);
    const candidates = await listCandidates({ excludeDietMask: mask, limit: 500 });
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) expect(satisfiesDiets(c.dietFlags, mask)).toBe(true);
    expect(mask).toBe(DietFlag.vegetarian | DietFlag.dairy_free);
  });

  it('keeps only recipes that are explicitly free of avoided allergens', async () => {
    const candidates = await listCandidates({ avoidAllergens: ['milk', 'egg'], limit: 2000 });
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.allergens.milk).toBe('free');
      expect(c.allergens.egg).toBe('free');
    }
    const ids = new Set(candidates.map((c) => c.id));
    // Unknown egg status: excluded even though it does not "contain" egg.
    expect(ids.has('mealdb:52765')).toBe(false);
  });

  it('filters by cuisine, course, time and gentle, and orders by health score', async () => {
    const candidates = await listCandidates({
      cuisines: ['italian', 'greek'],
      course: ['main', 'soup'],
      maxMinutes: 60,
      limit: 100,
    });
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(['italian', 'greek']).toContain(c.cuisine);
      expect(['main', 'soup']).toContain(c.course);
      expect(c.totalMinutes).not.toBeNull();
      expect(c.totalMinutes ?? Infinity).toBeLessThanOrEqual(60);
    }
    const scores = candidates.map((c) => c.healthScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    const gentle = await listCandidates({ gentle: true, limit: 50 });
    for (const c of gentle) expect(c.gentle).toBe(true);
  });

  it('includes matched ingredient ids and honours limit and exclusions', async () => {
    const [first] = await listCandidates({ limit: 1 });
    expect(first?.ingredientIds.length).toBeGreaterThan(0);
    const next = await listCandidates({ limit: 5, excludeIds: [first?.id ?? ''] });
    expect(next).toHaveLength(5);
    expect(next.map((c) => c.id)).not.toContain(first?.id);
  });
});

describeDb('searchRecipes', () => {
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

describeDb('ingredients and substitutions', () => {
  it('fetches ingredients by id with parsed fields', async () => {
    const [onion, missing] = await getIngredients(['onion', 'nope']);
    expect(missing).toBeUndefined();
    expect(onion).toMatchObject({ id: 'onion', category: 'produce', pantryStaple: true });
    expect(onion?.gramsPerUnit.cup).toBe(160);
    expect(onion?.allergens).toEqual([]);
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

describeDb('catalog metadata', () => {
  it('lists cuisines with counts and reads build info', async () => {
    const cuisines = await getCuisines();
    expect(cuisines[0]?.recipeCount).toBeGreaterThanOrEqual(cuisines[1]?.recipeCount ?? 0);
    expect(cuisines.find((c) => c.cuisine === 'greek')?.region).toBe('southern_europe');
    const meta = await getCatalogMeta();
    expect(meta.schemaVersion).toBe(1);
    expect(meta.recipeCount).toBeGreaterThan(0);
  });
});
