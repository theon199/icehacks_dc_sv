import { createRankContext, type RankInput } from './context';
import { explainRecipe, formatMinutes } from './explain';
import { CATALOG, recipe } from './fixtures/catalog';
import { makeRecipe } from './fixtures/makeRecipe';
import { ANSWERED_PREFERENCES } from './fixtures/prefs';
import { scoreRecipe } from './score';
import { type UserPreferences } from '../types/preferences';
import { type RecipeSummary } from '../types/recipe';

const NOW = Date.UTC(2026, 10, 1);

function explain(
  target: RecipeSummary,
  prefs: Partial<UserPreferences>,
  extra: Partial<RankInput> = {},
  mode: Parameters<typeof explainRecipe>[3] = 'forYou',
) {
  const ctx = createRankContext(
    { prefs: { ...ANSWERED_PREFERENCES, ...prefs }, now: NOW, ...extra },
    CATALOG,
  );
  return explainRecipe(target, scoreRecipe(target, ctx).features, ctx, mode);
}

const texts = (reasons: readonly { text: string }[]) => reasons.map((r) => r.text);

describe('explainRecipe', () => {
  it('names the time budget, goal and pantry use', () => {
    const reasons = explain(
      recipe('chana-masala'),
      { timeBudgetMinutes: 30, goals: ['more_protein'] },
      { pantry: ['chickpea', 'tomato', 'onion', 'spinach', 'ginger'] },
    );
    expect(texts(reasons)).toEqual(
      expect.arrayContaining([
        'Fits your 30-minute weeknights',
        'High in protein for your goal',
        'Uses 5 things in your pantry',
      ]),
    );
    expect(reasons).toHaveLength(3);
  });

  it('uses the first of the person’s goals that the dish serves', () => {
    const reasons = explain(recipe('minestrone'), { goals: ['lower_sodium', 'plant_forward'] });
    expect(texts(reasons)).toContain('Lower in sodium, as you asked');
    expect(texts(reasons)).not.toContain('Plant-forward, like you wanted');
  });

  it('words a shared goal from the tags the dish actually carries', () => {
    const goalText = (
      goalTags: RecipeSummary['goalTags'],
      goal: UserPreferences['goals'][number],
    ) => explain(makeRecipe({ goalTags }), { goals: [goal] }).find((r) => r.code === 'goal')?.text;

    expect(goalText(['high_protein'], 'steady_energy')).toBe('Protein for steadier energy');
    expect(goalText(['high_fiber'], 'steady_energy')).toBe('Fiber for steadier energy');
    expect(goalText(['high_fiber', 'high_protein'], 'steady_energy')).toBe(
      'Fiber and protein for steadier energy',
    );
    expect(goalText(['lower_sat_fat'], 'heart_friendly')).toBe(
      'Lower in saturated fat, for your goal',
    );
    expect(goalText(['heart_friendly'], 'heart_friendly')).toBe('Heart-friendly, for your goal');
    expect(goalText(['high_protein'], 'steady_energy')).not.toMatch(/fiber/i);
  });

  it('mentions loved cuisines and their neighbours', () => {
    expect(texts(explain(recipe('pad-thai'), { cuisines: ['thai'] }))).toContain(
      'You love Thai food',
    );
    const shown = [{ recipeId: 'f:summer-rolls', at: NOW }];
    expect(texts(explain(recipe('chicken-pho'), { cuisines: ['thai'] }, { shown }))).toContain(
      'Close to the Thai food you love',
    );
  });

  it('calls out a new cuisine from a loved region', () => {
    expect(texts(explain(recipe('chicken-pho'), { cuisines: ['thai'] }))).toContain(
      'Something new from Southeast Asia',
    );
  });

  it('mentions taste history once the person has liked similar dishes', () => {
    const feedback = [
      { recipeId: 'f:dal-tadka', kind: 'cooked' as const, at: NOW, reasons: [] },
      { recipeId: 'f:chana-masala', kind: 'cooked' as const, at: NOW, reasons: [] },
    ];
    expect(texts(explain(recipe('red-lentil-soup'), {}, { feedback }))).toContain(
      "Like dishes you've enjoyed",
    );
  });

  it('puts the reason for the current mode first', () => {
    const quick = explain(recipe('greek-salad'), { cuisines: ['greek'] }, {}, 'quick');
    expect(quick[0]?.code).toBe('time');
    const pantry = explain(
      recipe('greek-salad'),
      { cuisines: ['greek'] },
      { pantry: ['cucumber', 'tomato', 'feta'] },
      'pantry',
    );
    expect(pantry[0]).toEqual({ code: 'pantry', text: 'Uses 3 things in your pantry' });
    const gentle = explain(recipe('miso-soup'), { smallAppetite: true }, {}, 'gentle');
    expect(gentle[0]).toEqual({ code: 'gentle', text: 'Gentle on a small appetite' });
  });

  it('uses singular wording for one pantry item', () => {
    const reasons = explain(
      makeRecipe({ coreIngredientIds: ['rice', 'kale'] }),
      {},
      { pantry: ['rice'] },
      'pantry',
    );
    expect(texts(reasons)).toContain('Uses 1 thing in your pantry');
  });

  it('always returns two or three distinct reasons', () => {
    for (const target of CATALOG) {
      for (const prefs of [{}, { cuisines: ['thai'], goals: ['more_fiber' as const] }]) {
        const reasons = explain(target, prefs);
        expect(reasons.length).toBeGreaterThanOrEqual(2);
        expect(reasons.length).toBeLessThanOrEqual(3);
        expect(new Set(reasons.map((r) => r.code)).size).toBe(reasons.length);
      }
    }
  });

  it('still gives two truthful reasons when time and calories are unknown', () => {
    const sparse = makeRecipe({
      cuisine: 'polish',
      totalMinutes: null,
      effort: 2,
      healthScore: 0.3,
      nutrition: { ...makeRecipe().nutrition, kcal: null },
    });
    expect(explain(sparse, {})).toEqual([
      { code: 'cuisine', text: 'Polish cooking' },
      { code: 'effort', text: 'Moderate effort' },
    ]);
    const tagged = makeRecipe({ ...sparse, id: 'test:tagged', goalTags: ['high_fiber'] });
    expect(texts(explain(tagged, {}))).toEqual(['Good source of fiber', 'Polish cooking']);
  });

  it('tops up a single personal reason with a fact', () => {
    const loved = makeRecipe({
      cuisine: 'thai',
      totalMinutes: null,
      effort: 3,
      healthScore: 0.3,
      nutrition: { ...makeRecipe().nutrition, kcal: null },
    });
    expect(texts(explain(loved, { cuisines: ['thai'] }))).toEqual([
      'You love Thai food',
      'A project worth the effort',
    ]);
  });

  it('gives the gentle reason in gentle mode even without small appetite mode', () => {
    const gentle = explain(recipe('miso-soup'), { smallAppetite: false }, {}, 'gentle');
    expect(gentle[0]).toEqual({ code: 'gentle', text: 'Gentle on a small appetite' });
    expect(texts(explain(recipe('miso-soup'), { smallAppetite: false }))).not.toContain(
      'Gentle on a small appetite',
    );
  });

  it('falls back to plain facts when nothing personal applies', () => {
    const plain = makeRecipe({ totalMinutes: 150, effort: 3, healthScore: 0.2 });
    expect(texts(explain(plain, {}))).toEqual(['Ready in 2 h 30 min', '450 kcal per serving']);
  });

  it('formats durations for people', () => {
    expect(formatMinutes(1)).toBe('1 minute');
    expect(formatMinutes(25)).toBe('25 minutes');
    expect(formatMinutes(60)).toBe('1 hour');
    expect(formatMinutes(120)).toBe('2 hours');
    expect(formatMinutes(95)).toBe('1 h 35 min');
  });
});
