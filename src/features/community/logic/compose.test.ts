import {
  COMPOSE_LIMITS,
  buildPublishInput,
  emptyDraft,
  fitWithin,
  hasErrors,
  isDraftEmpty,
  overallProgress,
  validateDraft,
  type ComposeDraft,
} from './compose';

const photo = { uri: 'file:///photo.jpg', width: 3000, height: 2000 };

function draft(overrides: Partial<ComposeDraft> = {}): ComposeDraft {
  return {
    ...emptyDraft,
    recipeId: 'mealdb:52772',
    recipeTitle: 'Lentil soup',
    title: 'Lentil soup, my way',
    photos: [photo],
    ...overrides,
  };
}

describe('validateDraft', () => {
  it('accepts a complete cook post', () => {
    expect(validateDraft(draft({ rating: 5, body: 'So good' }))).toEqual({});
  });

  it('needs a recipe for cooks and remixes but not for tips', () => {
    expect(validateDraft(draft({ recipeId: null })).recipe).toBeDefined();
    expect(validateDraft(draft({ kind: 'remix', recipeId: null, body: 'x' })).recipe).toBeDefined();
    expect(
      validateDraft(draft({ kind: 'tip', recipeId: null, body: 'Salt pasta water' })).recipe,
    ).toBeUndefined();
  });

  it('requires a title within the limit, ignoring surrounding spaces', () => {
    expect(validateDraft(draft({ title: '   ' })).title).toBe('Give your post a title.');
    expect(validateDraft(draft({ title: 'a'.repeat(COMPOSE_LIMITS.title + 1) })).title).toMatch(
      /under 120/,
    );
    expect(validateDraft(draft({ title: `  ${'a'.repeat(COMPOSE_LIMITS.title)}  ` })).title).toBe(
      undefined,
    );
  });

  it('limits the note length', () => {
    expect(validateDraft(draft({ body: 'a'.repeat(COMPOSE_LIMITS.body + 1) })).body).toMatch(
      /2000/,
    );
  });

  it('asks tips and remixes to say something', () => {
    expect(validateDraft(draft({ kind: 'tip', body: '' })).body).toMatch(/tip/);
    expect(validateDraft(draft({ kind: 'remix', body: ' ' })).body).toMatch(/changed/);
  });

  it('needs a photo for a cook post and caps photos at four', () => {
    expect(validateDraft(draft({ photos: [] })).photos).toMatch(/photo/);
    expect(validateDraft(draft({ kind: 'tip', body: 'x', photos: [] })).photos).toBeUndefined();
    const five = Array.from({ length: 5 }, () => photo);
    expect(validateDraft(draft({ photos: five })).photos).toMatch(/Up to 4/);
  });

  it('rejects ratings outside 1 to 5', () => {
    expect(validateDraft(draft({ rating: 0 })).rating).toBeDefined();
    expect(validateDraft(draft({ rating: 6 })).rating).toBeDefined();
    expect(validateDraft(draft({ rating: 3 })).rating).toBeUndefined();
  });

  it('reports errors through hasErrors', () => {
    expect(hasErrors(validateDraft(draft()))).toBe(false);
    expect(hasErrors(validateDraft(emptyDraft))).toBe(true);
  });
});

describe('isDraftEmpty', () => {
  it('treats the starting draft as empty and any content as worth keeping', () => {
    expect(isDraftEmpty(emptyDraft)).toBe(true);
    expect(isDraftEmpty({ ...emptyDraft, body: 'hi' })).toBe(false);
    expect(isDraftEmpty({ ...emptyDraft, photos: [photo] })).toBe(false);
  });
});

describe('buildPublishInput', () => {
  const media = [{ path: 'u/1.jpg', width: 1600, height: 1067, blurhash: 'LKO2' }];

  it('trims text and passes uploaded media in order', () => {
    const input = buildPublishInput(
      draft({ title: ' Soup ', body: ' Tasty \n', rating: 4 }),
      media,
    );
    expect(input).toEqual({
      kind: 'cook',
      title: 'Soup',
      body: 'Tasty',
      recipeRef: 'mealdb:52772',
      rating: 4,
      parentPostId: null,
      media,
    });
  });

  it('keeps the parent only for remixes and drops ratings on tips', () => {
    expect(buildPublishInput(draft({ kind: 'remix', parentPostId: 'p1' }), []).parentPostId).toBe(
      'p1',
    );
    expect(buildPublishInput(draft({ kind: 'cook', parentPostId: 'p1' }), []).parentPostId).toBe(
      null,
    );
    expect(buildPublishInput(draft({ kind: 'tip', rating: 5 }), []).rating).toBeNull();
  });
});

describe('fitWithin', () => {
  it('scales the longest edge down to the limit', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1000, 3200)).toEqual({ width: 500, height: 1600 });
  });

  it('never upscales', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('overallProgress', () => {
  it('averages photo progress and clamps odd values', () => {
    expect(overallProgress([])).toBe(0);
    expect(overallProgress([1, 0.5])).toBe(0.75);
    expect(overallProgress([2, -1])).toBe(0.5);
  });
});
