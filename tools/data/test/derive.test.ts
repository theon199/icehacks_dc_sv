import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCuisine } from '../src/knowledge/cuisines.ts';
import {
  buildSummary,
  computeEffort,
  estimateServings,
  estimateTimes,
  familyKey,
  formatDuration,
  goalTags,
  isGentle,
  mapCourse,
  slugify,
  type GoalInputs,
} from '../src/derive/recipe.ts';
import { healthScore, type ScoreInputs } from '../src/score.ts';
import type { Nutrition } from '../src/types.ts';

const nutrition = (overrides: Partial<Nutrition>): Nutrition => ({
  kcal: 500,
  protein_g: 10,
  carbs_g: 60,
  fat_g: 20,
  sat_fat_g: 8,
  fiber_g: 2,
  sugar_g: 10,
  added_sugar_g: 5,
  sodium_mg: 900,
  ...overrides,
});

const goals = (overrides: Partial<GoalInputs>) =>
  goalTags({ nutrition: nutrition({}), servingGrams: 400, course: 'main', vegetarian: false, vegan: false, plantShare: null, ...overrides });

describe('goal tags', () => {
  it('tags nothing for a heavy, salty, low-fibre dish', () => {
    assert.deepEqual(goals({}), []);
  });

  it('applies the protein thresholds', () => {
    assert.ok(goals({ nutrition: nutrition({ protein_g: 20 }) }).includes('high_protein'));
    assert.ok(goals({ nutrition: nutrition({ kcal: 150, protein_g: 10 }) }).includes('high_protein'));
    assert.ok(!goals({ nutrition: nutrition({ protein_g: 19 }) }).includes('high_protein'));
  });

  it('uses the FDA high-fibre level', () => {
    assert.ok(goals({ nutrition: nutrition({ fiber_g: 5.6 }) }).includes('high_fiber'));
    assert.ok(!goals({ nutrition: nutrition({ fiber_g: 5.5 }) }).includes('high_fiber'));
  });

  it('uses course-specific sodium limits', () => {
    assert.ok(goals({ nutrition: nutrition({ sodium_mg: 600 }) }).includes('lower_sodium'));
    assert.ok(!goals({ nutrition: nutrition({ sodium_mg: 600 }), course: 'side' }).includes('lower_sodium'));
  });

  it('uses energy density for lower_calorie', () => {
    assert.ok(goals({ nutrition: nutrition({ kcal: 400 }), servingGrams: 400 }).includes('lower_calorie'));
    assert.ok(!goals({ nutrition: nutrition({ kcal: 600 }), servingGrams: 400 }).includes('lower_calorie'));
  });

  it('requires several conditions for heart_friendly', () => {
    const good = nutrition({ kcal: 450, sat_fat_g: 3, sodium_mg: 500, fiber_g: 4, added_sugar_g: 2 });
    assert.ok(goals({ nutrition: good }).includes('heart_friendly'));
    assert.ok(!goals({ nutrition: { ...good, sodium_mg: 700 } }).includes('heart_friendly'));
  });

  it('marks plant-forward from diet and plant share, even without nutrition', () => {
    assert.ok(goals({ nutrition: null, vegan: true }).includes('plant_forward'));
    assert.ok(goals({ vegetarian: true, plantShare: 0.6 }).includes('plant_forward'));
    assert.ok(!goals({ vegetarian: true, plantShare: 0.3 }).includes('plant_forward'));
  });
});

describe('health score', () => {
  const base: ScoreInputs = { kcal: 500, protein_g: 20, fiber_g: 5, sodium_mg: 600, sat_fat_g: 4, added_sugar_g: 5, vegetableShare: 0.3 };

  it('is deterministic and bounded', () => {
    const a = healthScore(base);
    assert.equal(a, healthScore({ ...base }));
    assert.ok(a >= 0 && a <= 1);
  });

  it('rewards fibre, protein and vegetables', () => {
    assert.ok(healthScore({ ...base, fiber_g: 10 }) > healthScore(base));
    assert.ok(healthScore({ ...base, protein_g: 30 }) > healthScore(base));
    assert.ok(healthScore({ ...base, vegetableShare: 0.6 }) > healthScore(base));
  });

  it('penalises sodium, saturated fat and added sugar', () => {
    assert.ok(healthScore({ ...base, sodium_mg: 1500 }) < healthScore(base));
    assert.ok(healthScore({ ...base, sat_fat_g: 15 }) < healthScore(base));
    assert.ok(healthScore({ ...base, added_sugar_g: 40 }) < healthScore(base));
  });

  it('falls back to a plant-share default without nutrition', () => {
    assert.equal(healthScore({ ...base, kcal: null, vegetableShare: 0.5 }), 0.7);
    assert.equal(healthScore({ ...base, kcal: null, vegetableShare: null }), 0.3);
  });
});

describe('servings, time and effort', () => {
  it('estimates servings from weight and keeps energy in bounds', () => {
    assert.equal(estimateServings('main', 1600, 2400), 4);
    assert.equal(estimateServings('main', null, null), 4);
    assert.equal(estimateServings('main', 400, 4000), 5);
    assert.equal(estimateServings('dessert', 3000, null), 12);
    assert.equal(estimateServings('main', 1200, 1800, 300), 6);
  });

  it('estimates times from lines and timers', () => {
    assert.deepEqual(estimateTimes(10, [1200, null, 600], 'main'), { total: 50, active: 25 });
    assert.deepEqual(estimateTimes(6, [], 'salad'), { total: 15, active: 15 });
    const long = estimateTimes(10, [86400], 'side');
    assert.ok(long.active <= 50);
  });

  it('scores effort from size, time and technique', () => {
    assert.equal(computeEffort(5, ['Mix.', 'Serve.'], 10), 1);
    assert.equal(computeEffort(10, ['a', 'b', 'c', 'd', 'e', 'f'], 30), 2);
    assert.equal(computeEffort(14, Array.from({ length: 9 }, () => 'Knead the dough.'), 60), 3);
  });
});

describe('course, cuisine and identity', () => {
  it('maps source categories and titles to courses', () => {
    assert.equal(mapCourse('mealdb', ['Dessert'], 'Apple Pie'), 'dessert');
    assert.equal(mapCourse('mealdb', ['Chicken'], 'Chicken Noodle Soup'), 'soup');
    assert.equal(mapCourse('mealdb', ['Starter'], 'Baked brie'), 'snack');
    assert.equal(mapCourse('mealdb', ['Beef'], 'Beef Stroganoff'), 'main');
    assert.equal(mapCourse('medlineplus', ['dinner', 'salads'], 'Chicken Salad'), 'salad');
    assert.equal(mapCourse('medlineplus', ['drinks'], 'Mango Shake'), 'drink');
    assert.equal(mapCourse('mealdb', ['Dessert'], 'Hot Chocolate Fudge'), 'dessert');
  });

  it('resolves cuisine from area, then title, then dish words', () => {
    assert.deepEqual(resolveCuisine('United States', 'Pancakes', 'international'), { cuisine: 'american', region: 'north_america' });
    assert.equal(resolveCuisine(null, 'Cambodian Fish Curry', 'international').cuisine, 'cambodian');
    assert.equal(resolveCuisine(null, 'Easy Chicken Enchiladas', 'american').cuisine, 'mexican');
    assert.equal(resolveCuisine(null, 'Turkey Burgers', 'american').cuisine, 'american');
    assert.equal(resolveCuisine(null, 'Swiss Chard Gratin', 'international').cuisine, 'french');
    assert.equal(resolveCuisine(null, 'Mystery Bake', 'international').cuisine, 'international');
  });

  it('slugifies titles', () => {
    assert.equal(slugify('Crème Brûlée & Berries!'), 'creme-brulee-and-berries');
    assert.equal(slugify("Shepherd's Pie"), 'shepherds-pie');
  });

  it('groups near-duplicate titles into one family', () => {
    assert.equal(familyKey('Easy Meatballs'), familyKey('Baked Meatballs'));
    assert.equal(familyKey('Breadfruit in Butter Sauce'), familyKey('Breadfruit in Butter Sauce Recipe'));
    assert.notEqual(familyKey('Chicken Curry'), familyKey('Beef Curry'));
  });
});

describe('summary', () => {
  it('writes one or two factual sentences', () => {
    const text = buildSummary({
      cuisineLabel: 'Indian',
      course: 'main',
      keyIngredients: ['chickpeas', 'spinach', 'tomatoes'],
      totalMinutes: 35,
      nutrition: nutrition({ protein_g: 22 }),
      goals: ['high_protein'],
    });
    assert.equal(text, 'An Indian main dish with chickpeas, spinach and tomatoes, ready in about 35 minutes. Each serving has about 22 g of protein.');
  });

  it('omits nutrition when it is not known', () => {
    const text = buildSummary({ cuisineLabel: null, course: 'dessert', keyIngredients: [], totalMinutes: 90, nutrition: null, goals: [] });
    assert.equal(text, 'A dessert, ready in about 1½ hours.');
  });

  it('formats durations', () => {
    assert.equal(formatDuration(45), '45 minutes');
    assert.equal(formatDuration(60), '1 hour');
    assert.equal(formatDuration(150), '2½ hours');
  });
});

describe('gentle', () => {
  const base = {
    course: 'soup' as const,
    kcal: 300,
    sodiumMg: 500,
    totalMinutes: 40,
    effort: 1,
    title: 'Carrot Soup',
    steps: ['Simmer the carrots until soft.'],
    ingredientIds: ['carrot'],
  };

  it('accepts a moderate, soft, simple dish', () => {
    assert.equal(isGentle(base), true);
  });

  it('rejects large portions, deep-frying, long or involved cooking', () => {
    assert.equal(isGentle({ ...base, kcal: 800 }), false);
    assert.equal(isGentle({ ...base, steps: ['Deep fry until golden.'] }), false);
    assert.equal(isGentle({ ...base, totalMinutes: 120 }), false);
    assert.equal(isGentle({ ...base, effort: 3 }), false);
    assert.equal(isGentle({ ...base, kcal: null }), false);
    assert.equal(isGentle({ ...base, title: 'Fiery Carrot Soup' }), false);
  });
});
