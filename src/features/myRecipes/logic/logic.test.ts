import { checkOwnRecipe } from '@/domain/ownRecipes';
import type { ImportedRecipe } from '@/lib/api/ai';
import { ApiError } from '@/lib/api/errors';

import { draftFromImport, draftProblem, sourceFor, toMyRecipe } from './draft';
import { describeImportProblem, PhotoPrepError } from './importErrors';
import { firstLink, normalizeLink } from './link';
import { linkHost, missingText, recipeMeta } from './meta';
import { lineNote, safetySnapshot, safetySummary } from './safetyText';

const RECIPE: ImportedRecipe = {
  title: 'Garlic fried rice',
  servings: 2,
  total_minutes: 15,
  cuisine: 'Filipino',
  meal: 'breakfast',
  ingredients: [
    { text: '4 cups cooked rice', name: 'rice' },
    { text: '6 cloves garlic', name: 'garlic' },
  ],
  steps: ['Fry the garlic.', 'Add the rice.'],
  source_url: 'https://recipes.example.com/sinangag',
};

describe('draft', () => {
  it('keeps the page a link was read from as its source', () => {
    expect(sourceFor({ source: 'link', url: 'https://x.example.com/a' }, RECIPE)).toEqual({
      kind: 'link',
      url: 'https://recipes.example.com/sinangag',
    });
    expect(sourceFor({ source: 'text', text: 'rice' }, RECIPE)).toEqual({
      kind: 'text',
      url: null,
    });
  });

  it('becomes a saved recipe without blank lines', () => {
    const draft = draftFromImport(RECIPE, { kind: 'photo', url: null });
    const withBlank = {
      ...draft,
      cuisine: '  ',
      ingredients: [...draft.ingredients, { key: 'x', text: ' ', name: '' }],
      steps: [...draft.steps, { key: 'y', text: '' }],
    };
    const safety = { status: 'clear' as const, allergens: [], diets: [], checkedAt: 'now' };
    const recipe = toMyRecipe(withBlank, {
      id: 'r1',
      at: 'now',
      catalogIdFor: (name) => (name === 'rice' ? 'rice' : null),
      safety,
      confirmations: [],
    });
    expect(recipe.cuisine).toBeNull();
    expect(recipe.ingredients).toEqual([
      { text: '4 cups cooked rice', name: 'rice', catalogIngredientId: 'rice' },
      { text: '6 cloves garlic', name: 'garlic', catalogIngredientId: null },
    ]);
    expect(recipe.steps).toEqual(['Fry the garlic.', 'Add the rice.']);
  });

  it('names what stops a draft from being saved', () => {
    const draft = draftFromImport(RECIPE, { kind: 'text', url: null });
    expect(draftProblem(draft)).toBeNull();
    expect(draftProblem({ ...draft, title: ' ' })).toBe('Give the recipe a name.');
    expect(draftProblem({ ...draft, servings: 0 })).toMatch(/Servings/);
    expect(draftProblem({ ...draft, ingredients: [] })).toBe('Add at least one ingredient.');
    expect(draftProblem({ ...draft, steps: [{ key: 's', text: ' ' }] })).toBe(
      'Add at least one step.',
    );
  });
});

describe('links', () => {
  it('accepts http(s) links and bare addresses, nothing else', () => {
    expect(normalizeLink(' seriouseats.com/adobo ')).toBe('https://seriouseats.com/adobo');
    expect(normalizeLink('http://example.com/r')).toBe('http://example.com/r');
    expect(normalizeLink('javascript:alert(1)')).toBeNull();
    expect(normalizeLink('ftp://example.com/r')).toBeNull();
    expect(normalizeLink('not a link')).toBeNull();
    expect(normalizeLink('localhost')).toBeNull();
  });

  it('finds the first link in pasted text', () => {
    expect(firstLink('Try this https://example.com/adobo it is great')).toBe(
      'https://example.com/adobo',
    );
    expect(firstLink('')).toBeNull();
  });
});

describe('meta', () => {
  it('reads like a recipe card', () => {
    expect(recipeMeta({ cuisine: 'Filipino', minutes: 45, servings: 4 }, (m) => `${m} min`)).toBe(
      'Filipino · 45 min · serves 4',
    );
    expect(recipeMeta({ cuisine: null, minutes: null, servings: 2 }, String)).toBe('serves 2');
    expect(missingText(['bay leaves'])).toBe('Need bay leaves');
    expect(missingText(['a', 'b', 'c'])).toBe('Need 3 things');
    expect(missingText([])).toBeNull();
    expect(linkHost('https://www.example.com/x')).toBe('example.com');
  });
});

describe('safety wording', () => {
  const ingredients = [
    { text: '1 cup vinegar', name: 'datu puti vinegar', catalogIngredientId: null },
  ];

  it('summarises a recipe with lines to confirm and records what it was checked against', () => {
    const prefs = { allergens: ['milk' as const], diets: ['vegan' as const] };
    const safety = checkOwnRecipe({ ingredients, catalog: new Map(), prefs, confirmations: [] });
    expect(safetySummary(safety)).toMatchObject({
      tone: 'check',
      title: '1 ingredient to confirm',
    });
    expect(lineNote(safety.ingredients[0]!)).toBe(
      "Famara doesn't know this ingredient · May contain milk",
    );
    expect(safetySnapshot(safety, prefs, 'at')).toEqual({
      status: 'needs_check',
      allergens: ['milk'],
      diets: ['vegan'],
      checkedAt: 'at',
    });
  });

  it('records an unanswered check as needing a check', () => {
    const prefs = { allergens: null, diets: null };
    const safety = checkOwnRecipe({ ingredients, catalog: new Map(), prefs, confirmations: [] });
    expect(safetySummary(safety).tone).toBe('unanswered');
    expect(safetySnapshot(safety, prefs, 'at').status).toBe('needs_check');
  });
});

describe('describeImportProblem', () => {
  it('pauses importing until the daily limit resets', () => {
    const error = new ApiError({
      functionName: 'recipe-import',
      kind: 'rate_limited',
      code: 'quota_exceeded',
      retryAfterSeconds: 7200,
    });
    const problem = describeImportProblem(error, new Date('2026-11-14T10:00:00'));
    expect(problem).toMatchObject({
      title: "You've reached today's import limit",
      canRetry: false,
      pause: { seconds: 7200, note: 'Daily limit reached. Imports refresh in about 2 hours.' },
    });
  });

  it('says when the person is offline, and stays quiet for a cancellation', () => {
    expect(
      describeImportProblem(new ApiError({ functionName: 'recipe-import', kind: 'network' })),
    ).toMatchObject({
      kind: 'offline',
      canRetry: true,
    });
    expect(
      describeImportProblem(new ApiError({ functionName: 'recipe-import', kind: 'cancelled' })),
    ).toBeNull();
  });

  it('asks for another photo when one cannot be prepared', () => {
    expect(describeImportProblem(new PhotoPrepError('x'))).toMatchObject({ kind: 'photo' });
  });
});
