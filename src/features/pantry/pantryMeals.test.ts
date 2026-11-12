import {
  ALLERGEN_IDS,
  toDomainRecipe,
  type AllergenMap,
  type RecipeCandidate,
} from '@/lib/catalog';
import { toUserPreferences } from '@/stores/domainBridge';
import { defaultPreferences, type Preferences } from '@/stores/preferences';

import { toRankPreferences, toRankRecipe } from './deps';
import { rankPantryMeals } from './pantryMeals';
import { missingStaples, QUICK_STAPLE_IDS } from './staples';

const allFree = Object.fromEntries(ALLERGEN_IDS.map((id) => [id, 'free'])) as AllergenMap;

/** Salt and oil play the catalog's pantry staples: matched, but never core. */
const STAPLES = new Set(['salt', 'vegetable_oil']);

function candidate(id: string, ingredientIds: string[], extra: Partial<RecipeCandidate> = {}) {
  const recipe: RecipeCandidate = {
    id,
    slug: id,
    title: id,
    summary: '',
    cuisine: 'indian',
    region: 'south_asia',
    course: 'main',
    totalMinutes: 30,
    activeMinutes: 20,
    servings: 2,
    effort: 1,
    imageUrl: null,
    imageCredit: null,
    sourceName: 'test',
    sourceUrl: null,
    license: 'test',
    nutritionConfidence: 'none',
    nutrition: null,
    allergens: allFree,
    dietFlags: 0,
    goalTags: [],
    gentle: false,
    healthScore: 0.5,
    familyId: id,
    ingredientIds,
    coreIngredientIds: [...new Set(ingredientIds)].filter((ingredient) => !STAPLES.has(ingredient)),
    ...extra,
  };
  return recipe;
}

const answered: Preferences = {
  ...defaultPreferences,
  allergens: ['peanut'],
  allergensAnswered: true,
  onboardedAt: '2026-11-01T00:00:00.000Z',
};
const now = Date.UTC(2026, 10, 11);

describe('preference adapter', () => {
  it('is the shared bridge', () => {
    expect(toRankPreferences).toBe(toUserPreferences);
  });

  it('treats unanswered safety questions as unanswered, never as "none"', () => {
    const prefs = toRankPreferences(defaultPreferences, 'us');
    expect(prefs.allergens).toBeNull();
    expect(prefs.diets).toBeNull();
  });

  it('carries answers across and renames goals the domain spells differently', () => {
    const prefs = toRankPreferences(
      {
        ...answered,
        diets: ['vegetarian'],
        goals: ['steadier_energy', 'more_fiber'],
        effort: null,
      },
      'metric',
    );
    expect(prefs).toMatchObject({
      allergens: ['peanut'],
      diets: ['vegetarian'],
      goals: ['steady_energy', 'more_fiber'],
      effort: 3,
      units: 'metric',
    });
  });
});

describe('recipe adapter', () => {
  it('is the shared catalog mapping', () => {
    expect(toRankRecipe).toBe(toDomainRecipe);
  });

  it('takes core ingredients from the catalog and fills missing nutrition', () => {
    const recipe = toRankRecipe(candidate('a', ['rice', 'salt', 'rice', 'egg']));
    expect(recipe.coreIngredientIds).toEqual(['rice', 'egg']);
    expect(recipe.nutrition.kcal).toBeNull();
  });

  it('maps an unknown region to the global one', () => {
    expect(toRankRecipe(candidate('a', [], { region: 'atlantis' })).region).toBe('global');
  });
});

describe('meals you can make', () => {
  const candidates = [
    candidate('all-in', ['rice', 'egg', 'onion', 'salt']),
    candidate('mostly', ['rice', 'egg', 'onion', 'chicken_breast']),
    candidate('barely', ['rice', 'beef', 'leek', 'carrot']),
    candidate('nutty', ['rice', 'egg', 'peanut'], {
      allergens: { ...allFree, peanut: 'contains' },
    }),
    candidate('unsure', ['rice', 'egg'], { allergens: { ...allFree, peanut: 'unknown' } }),
  ];
  const pantry = new Set(['rice', 'egg', 'onion', 'peanut']);
  const rank = (prefs: Preferences, onHand = pantry) =>
    rankPantryMeals({
      candidates,
      pantry: onHand,
      prefs: toRankPreferences(prefs, 'us'),
      now,
      size: 8,
    });

  it('keeps dishes the pantry mostly covers and says what is missing', () => {
    const meals = rank(answered);
    expect(meals.map((m) => m.recipe.id).sort()).toEqual(['all-in', 'mostly']);
    expect(meals.find((m) => m.recipe.id === 'mostly')).toMatchObject({
      have: 3,
      total: 4,
      missing: ['chicken_breast'],
    });
    expect(meals.find((m) => m.recipe.id === 'all-in')).toMatchObject({ have: 3, total: 3 });
  });

  it('never suggests a dish that contains, or may contain, a declared allergen', () => {
    const ids = rank(answered).map((m) => m.recipe.id);
    expect(ids).not.toContain('nutty');
    expect(ids).not.toContain('unsure');
  });

  it('suggests nothing until allergies are answered', () => {
    expect(rank(defaultPreferences)).toEqual([]);
  });

  it('counts diets as answered with allergens, before onboarding finishes', () => {
    const meals = rank({ ...answered, onboardedAt: null });
    expect(meals.map((m) => m.recipe.id).sort()).toEqual(['all-in', 'mostly']);
  });

  it('suggests nothing for an empty pantry', () => {
    expect(rank(answered, new Set())).toEqual([]);
  });

  it('offers only staples the pantry is missing', () => {
    const offered = missingStaples(QUICK_STAPLE_IDS, new Set(['salt', 'egg']));
    expect(offered).not.toContain('salt');
    expect(offered).toContain('olive_oil');
    expect(offered).toHaveLength(QUICK_STAPLE_IDS.length - 2);
  });
});
