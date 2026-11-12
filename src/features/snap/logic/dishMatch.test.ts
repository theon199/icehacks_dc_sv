import { makeRecipe } from '@/domain/recommend/fixtures/makeRecipe';
import type { RecipeSummary } from '@/domain/types/recipe';
import type { SnapDish } from '@/lib/api/ai';

import {
  dishCloseness,
  dishSearchQueries,
  goalFit,
  improvementsOver,
  setbacksFor,
  mergeDishHits,
  pickHealthierVersion,
  rankCloseRecipes,
  type DishSearchResult,
} from './dishMatch';

const range = (estimate: number, spread = 0.2) => ({
  estimate,
  low: estimate * (1 - spread),
  high: estimate * (1 + spread),
});

const dish: SnapDish = {
  name: 'Chicken tikka masala',
  cuisine: 'Indian',
  key_ingredients: ['chicken', 'tomato', 'cream', 'garam masala', 'rice'],
  portion: 'one plate with rice, about 450 g',
  nutrition: {
    kcal: range(820),
    protein_g: range(38),
    carbs_g: range(80),
    fat_g: range(38),
    fiber_g: range(4),
    sodium_mg: range(1600),
  },
  nutrition_confidence: 'estimated',
  confidence: 0.86,
};

const answered = { allergens: [], diets: [] };

function search(results: [DishSearchResult<RecipeSummary>['query'], RecipeSummary[]][]) {
  return results.map(([query, recipes]) => ({ query, recipes }));
}

describe('dish search queries', () => {
  it('searches the name, its distinctive words and the key ingredients', () => {
    expect(dishSearchQueries(dish).map((q) => `${q.kind}:${q.text}`)).toEqual([
      'name:Chicken tikka masala',
      'nameWord:chicken',
      'nameWord:tikka',
      'nameWord:masala',
      'ingredient:tomato',
      'ingredient:cream',
      'ingredient:garam masala',
    ]);
  });

  it('skips generic words and one-word names', () => {
    const queries = dishSearchQueries({ name: 'Ramen bowl', cuisine: null, key_ingredients: [] });
    expect(queries.map((q) => q.text)).toEqual(['Ramen bowl']);
  });
});

describe('closest recipes', () => {
  const tikka = makeRecipe({ id: 'r:tikka', title: 'Chicken Tikka Masala', cuisine: 'indian' });
  const korma = makeRecipe({ id: 'r:korma', title: 'Chicken Korma', cuisine: 'indian' });
  const soup = makeRecipe({ id: 'r:soup', title: 'Tomato soup', cuisine: 'british' });
  const withPeanut = makeRecipe({
    id: 'r:satay',
    title: 'Chicken tikka satay',
    allergens: { peanut: 'contains' },
  });
  const unverified = makeRecipe({
    id: 'r:unknown',
    title: 'Chicken tikka wrap',
    allergens: { peanut: 'unknown' },
  });

  const hits = mergeDishHits(
    search([
      [{ kind: 'name', text: dish.name }, [tikka, withPeanut, unverified]],
      [{ kind: 'nameWord', text: 'chicken' }, [tikka, korma, withPeanut, unverified]],
      [{ kind: 'ingredient', text: 'tomato' }, [tikka, soup]],
      [{ kind: 'ingredient', text: 'cream' }, [tikka, korma]],
    ]),
  );

  it('merges searches into one hit per recipe', () => {
    const tikkaHit = hits.find((hit) => hit.recipe.id === 'r:tikka');
    expect(tikkaHit).toMatchObject({ nameHit: true, ingredientHits: 2 });
    expect(hits).toHaveLength(5);
  });

  it('ranks the same dish above related ones', () => {
    const ranked = rankCloseRecipes(hits, dish, answered);
    expect(ranked[0]?.recipe.id).toBe('r:tikka');
    expect(ranked.map((entry) => entry.recipe.id)).toContain('r:korma');
    const tikkaScore = dishCloseness(
      hits.find((h) => h.recipe.id === 'r:tikka')!,
      dish,
    );
    expect(tikkaScore).toBeGreaterThanOrEqual(0.85);
  });

  it('drops recipes that are unsafe or unverified for the person (fail-closed)', () => {
    const ids = rankCloseRecipes(hits, dish, { allergens: ['peanut'], diets: [] }).map(
      (entry) => entry.recipe.id,
    );
    expect(ids).not.toContain('r:satay');
    expect(ids).not.toContain('r:unknown');
    expect(ids).toContain('r:tikka');
  });

  it('shows nothing until allergies and diets are answered', () => {
    expect(rankCloseRecipes(hits, dish, { allergens: null, diets: null })).toEqual([]);
  });
});

describe('healthier version', () => {
  const lighter = makeRecipe({
    id: 'r:light',
    title: 'Lighter chicken tikka masala',
    goalTags: ['high_protein', 'lower_calorie'],
    healthScore: 0.8,
    nutrition: { ...makeRecipe().nutrition, kcal: 480, proteinG: 45, sodiumMg: 700, fiberG: 7 },
  });
  const same = makeRecipe({
    id: 'r:same',
    title: 'Chicken tikka masala',
    nutrition: {
      ...makeRecipe().nutrition,
      kcal: 800,
      proteinG: 36,
      sodiumMg: 1500,
      fatG: 37,
      fiberG: 4,
    },
  });
  const unknownNutrition = makeRecipe({
    id: 'r:none',
    title: 'Chicken tikka masala bowl',
    nutritionConfidence: 'none',
    nutrition: { ...makeRecipe().nutrition, kcal: 300 },
  });

  it('lists clear improvements over the estimate only', () => {
    expect(improvementsOver(lighter, dish.nutrition).map((i) => i.nutrient)).toEqual([
      'kcal',
      'sodium_mg',
      'fat_g',
      'fiber_g',
      'protein_g',
    ]);
    expect(improvementsOver(same, dish.nutrition)).toEqual([]);
  });

  it('scores goal fit by goals served, or health score without goals', () => {
    expect(goalFit(lighter, ['more_protein', 'more_fiber'])).toBe(0.5);
    expect(goalFit(lighter, [])).toBe(0.8);
  });

  it('picks a close recipe that is meaningfully healthier and serves the goals', () => {
    const pick = pickHealthierVersion(
      [
        { recipe: same, closeness: 1 },
        { recipe: unknownNutrition, closeness: 0.9 },
        { recipe: lighter, closeness: 0.7 },
      ],
      dish.nutrition,
      ['more_protein'],
    );
    expect(pick?.recipe.id).toBe('r:light');
    expect(pick?.goalsServed).toEqual(['more_protein']);
    expect(pick?.improvements[0]).toEqual({ nutrient: 'kcal', direction: 'less', amount: 340 });
  });

  it('offers nothing when no close recipe is healthier', () => {
    expect(pickHealthierVersion([{ recipe: same, closeness: 1 }], dish.nutrition, [])).toBeNull();
    expect(
      pickHealthierVersion([{ recipe: lighter, closeness: 0.1 }], dish.nutrition, []),
    ).toBeNull();
  });

  const lighterButSaltier = makeRecipe({
    id: 'r:salty',
    title: 'Light chicken tikka masala',
    goalTags: ['lower_calorie'],
    healthScore: 0.7,
    nutrition: { ...makeRecipe().nutrition, kcal: 520, proteinG: 38, sodiumMg: 2400, fiberG: 4 },
  });

  const fewerFibres = makeRecipe({
    id: 'r:low-fibre',
    title: 'Chicken tikka masala with white rice',
    goalTags: ['lower_calorie'],
    healthScore: 0.6,
    nutrition: { ...makeRecipe().nutrition, kcal: 600, proteinG: 38, sodiumMg: 1500, fiberG: 1 },
  });

  it('flags clearly worse nutrients, general ones always and goal ones when set', () => {
    expect(setbacksFor(lighterButSaltier, dish.nutrition, ['lower_sodium'])).toEqual(['sodium_mg']);
    expect(setbacksFor(lighterButSaltier, dish.nutrition, ['more_protein'])).toEqual(['sodium_mg']);
    expect(setbacksFor(lighterButSaltier, dish.nutrition, [])).toEqual(['sodium_mg']);
    expect(setbacksFor(lighter, dish.nutrition, ['heart_friendly', 'steady_energy'])).toEqual([]);
    expect(setbacksFor(fewerFibres, dish.nutrition, [])).toEqual([]);
    expect(setbacksFor(fewerFibres, dish.nutrition, ['more_fiber'])).toEqual(['fiber_g']);
  });

  it('never offers a recipe that is clearly worse on a goal nutrient', () => {
    const closest = [{ recipe: lighterButSaltier, closeness: 0.9 }];
    expect(pickHealthierVersion(closest, dish.nutrition, ['lower_sodium'])).toBeNull();
    expect(pickHealthierVersion(closest, dish.nutrition, ['heart_friendly'])).toBeNull();
  });

  it('never offers a heavier, saltier plate just because it fits a goal', () => {
    const richer = makeRecipe({
      id: 'r:rich',
      title: 'Double chicken tikka masala',
      goalTags: ['high_protein'],
      healthScore: 0.5,
      nutrition: {
        ...makeRecipe().nutrition,
        kcal: 1420,
        proteinG: 80,
        fatG: 40,
        sodiumMg: 3600,
        fiberG: 4,
      },
    });
    const closest = [{ recipe: richer, closeness: 0.9 }];
    expect(setbacksFor(richer, dish.nutrition, ['more_protein'])).toEqual(['kcal', 'sodium_mg']);
    expect(pickHealthierVersion(closest, dish.nutrition, ['more_protein'])).toBeNull();
    expect(pickHealthierVersion(closest, dish.nutrition, ['lighter_meals'])).toBeNull();
  });
});
