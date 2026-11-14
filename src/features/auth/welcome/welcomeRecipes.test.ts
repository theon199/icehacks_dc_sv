import type { RecipeSummary } from '@/lib/catalog';

import { nextPick } from './slides/ForYouSlide';
import type { ChefExample } from './welcomeContent';
import { planDays, planRangeLabel } from './welcomeDates';
import { availableIds, confirmedAnswers, formatGrams, toWelcomeBook } from './welcomeRecipes';
import { createWelcomeScale } from './welcomeScale';

function summary(id: string, overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id,
    slug: id,
    title: `Dish ${id}`,
    summary: '',
    cuisine: 'thai',
    region: 'southeast_asia',
    course: 'main',
    totalMinutes: 30,
    activeMinutes: 20,
    servings: 2,
    effort: 1,
    imageUrl: `https://example.test/${id}.jpg`,
    imageCredit: null,
    sourceName: 'Test',
    sourceUrl: null,
    license: 'test',
    nutritionConfidence: 'computed',
    nutrition: {
      kcal: 500,
      proteinG: 21.04,
      carbsG: 50,
      fatG: 10,
      satFatG: 2,
      fiberG: 8,
      sugarG: 5,
      addedSugarG: 0,
      sodiumMg: 400,
    },
    allergens: {
      milk: 'free',
      egg: 'free',
      fish: 'free',
      shellfish: 'free',
      tree_nut: 'free',
      peanut: 'free',
      wheat: 'free',
      soy: 'free',
      sesame: 'free',
      gluten: 'free',
    },
    dietFlags: 0,
    goalTags: [],
    gentle: false,
    healthScore: 0.9,
    familyId: id,
    ...overrides,
  };
}

describe('toWelcomeBook', () => {
  it('leaves out dishes without a photo and keeps missing figures missing', () => {
    const book = toWelcomeBook([
      summary('a'),
      summary('b', { imageUrl: null }),
      summary('c', { nutrition: null, nutritionConfidence: 'none', totalMinutes: null }),
    ]);
    expect([...book.keys()]).toEqual(['a', 'c']);
    expect(book.get('a')?.proteinGrams).toBe(21.04);
    expect(book.get('c')?.proteinGrams).toBeNull();
    expect(book.get('c')?.totalMinutes).toBeNull();
  });
});

describe('availableIds', () => {
  it('keeps order, drops unknown ids, and can require protein', () => {
    const book = toWelcomeBook([summary('a'), summary('b', { nutrition: null })]);
    expect(availableIds(book, ['b', 'x', 'a'])).toEqual(['b', 'a']);
    expect(availableIds(book, ['b', 'a'], { requireProtein: true })).toEqual(['a']);
  });
});

describe('confirmedAnswers', () => {
  it('shows only answers the catalog confirms', () => {
    const book = toWelcomeBook([summary('quick'), summary('slow', { totalMinutes: 90 })]);
    const example: ChefExample = {
      prompt: 'Ready in 30 minutes',
      answers: ['quick', 'slow'],
      fits: (recipe) => recipe.totalMinutes != null && recipe.totalMinutes <= 30,
    };
    expect(confirmedAnswers(book, example)).toEqual(['quick']);
  });
});

describe('formatGrams', () => {
  it('keeps whole grams whole and one decimal otherwise', () => {
    expect(formatGrams(15)).toBe('15g');
    expect(formatGrams(14.5)).toBe('14.5g');
    expect(formatGrams(21.04)).toBe('21g');
  });
});

describe('planDays and planRangeLabel', () => {
  it('lists today and the next days', () => {
    const days = planDays(new Date(2026, 10, 14, 9), 3);
    expect(days).toEqual([
      { weekday: 'Sat', day: 14, month: 'Nov' },
      { weekday: 'Sun', day: 15, month: 'Nov' },
      { weekday: 'Mon', day: 16, month: 'Nov' },
    ]);
    expect(planRangeLabel(days)).toBe('Nov 14–16');
  });

  it('names both months across a month end', () => {
    expect(planRangeLabel(planDays(new Date(2026, 10, 30), 3))).toBe('Nov 30–Dec 2');
  });
});

describe('nextPick', () => {
  it('takes the next dish that is not already showing, wrapping round', () => {
    const pool = ['a', 'b', 'c', 'd'];
    expect(nextPick(pool, ['a', 'b'], 2)).toEqual({ id: 'c', cursor: 3 });
    expect(nextPick(pool, ['d', 'a'], 3)).toEqual({ id: 'b', cursor: 2 });
    expect(nextPick(['a'], ['a'], 0)).toBeNull();
  });
});

describe('createWelcomeScale', () => {
  it('fits the design frame to the narrower of width and height', () => {
    const wide = createWelcomeScale(402, 1000);
    expect(wide.unit).toBeCloseTo(402 / 282);
    const short = createWelcomeScale(402, 300);
    expect(short.unit).toBeLessThan(wide.unit);
    expect(short.font(4)).toBe(12);
  });
});
