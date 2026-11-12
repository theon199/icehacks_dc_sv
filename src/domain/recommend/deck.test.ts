import { RANKING_CONFIG_V1 } from './config';
import { buildDeck, recentlyPassedIds, type BuildDeckInput } from './deck';
import { CATALOG, recipe } from './fixtures/catalog';
import { DAY_MS } from './taste';
import { type FeedbackEvent } from '../types/feedback';
import { DEFAULT_PREFERENCES, type UserPreferences } from '../types/preferences';

const NOW = Date.UTC(2026, 10, 1);

function deck(
  overrides: Omit<Partial<BuildDeckInput>, 'prefs'> & { prefs?: Partial<UserPreferences> } = {},
) {
  const { prefs, ...rest } = overrides;
  return buildDeck({
    candidates: CATALOG,
    mode: 'forYou',
    seed: 'session-1',
    size: 10,
    now: NOW,
    ...rest,
    prefs: { ...DEFAULT_PREFERENCES, ...prefs },
  });
}

const ids = (d: ReturnType<typeof deck>) => d.cards.map((card) => card.recipe.id);

describe('buildDeck', () => {
  it('returns the requested number of cards with scores and reasons', () => {
    const result = deck();
    expect(result.cards).toHaveLength(10);
    expect(result.configVersion).toBe(RANKING_CONFIG_V1.version);
    for (const card of result.cards) {
      expect(card.fitScore).toBeGreaterThanOrEqual(0);
      expect(card.fitScore).toBeLessThanOrEqual(100);
      expect(card.reasons.length).toBeGreaterThanOrEqual(1);
      expect(card.portionScale).toBe(1);
    }
  });

  it('is reproducible for a seed and varies across seeds', () => {
    expect(ids(deck({ seed: 'a' }))).toEqual(ids(deck({ seed: 'a' })));
    const decks = ['a', 'b', 'c', 'd', 'e'].map((seed) => ids(deck({ seed })).join());
    expect(new Set(decks).size).toBeGreaterThan(1);
  });

  it('does not depend on the order candidates arrive in', () => {
    const reversed = [...CATALOG].reverse();
    expect(ids(deck({ candidates: reversed }))).toEqual(ids(deck()));
  });

  it('follows the scores strictly at zero temperature', () => {
    const config = { ...RANKING_CONFIG_V1, feed: { ...RANKING_CONFIG_V1.feed, temperature: 0 } };
    const prefs = { cuisines: ['indian'], goals: ['more_protein' as const] };
    const a = deck({ config, prefs, seed: 'a' });
    expect(ids(a)).toEqual(ids(deck({ config, prefs, seed: 'b' })));
    expect(a.cards[0]!.score).toBe(Math.max(...a.cards.map((c) => c.score)));
  });

  it('keeps the same top picks most of the time at the default temperature', () => {
    const prefs = { cuisines: ['italian'], goals: ['heart_friendly' as const] };
    let topIsStrong = 0;
    for (let s = 0; s < 20; s++) {
      const first = deck({ prefs, seed: `s${s}` }).cards[0]!;
      if (first.fitScore >= 70) topIsStrong++;
    }
    expect(topIsStrong).toBeGreaterThanOrEqual(15);
  });

  it('never includes unsafe recipes and counts them', () => {
    const result = deck({ prefs: { allergens: ['peanut', 'fish'] }, size: 50 });
    for (const card of result.cards) {
      expect(card.recipe.allergens.peanut).toBe('free');
      expect(card.recipe.allergens.fish).toBe('free');
    }
    expect(ids(result)).not.toContain('f:green-curry-tofu');
    expect(result.excluded.unsafe).toBeGreaterThan(0);
    expect(result.available + result.excluded.unsafe).toBe(CATALOG.length);
  });

  it('excludes recipes passed on recently', () => {
    const feedback: FeedbackEvent[] = [
      { recipeId: 'f:minestrone', kind: 'pass', at: NOW - 2 * DAY_MS, reasons: [] },
      { recipeId: 'f:greek-salad', kind: 'pass', at: NOW - 20 * DAY_MS, reasons: [] },
      { recipeId: 'f:ceviche', kind: 'not_for_me', at: NOW - 30 * DAY_MS, reasons: [] },
    ];
    const result = deck({ feedback, size: 50 });
    expect(ids(result)).not.toContain('f:minestrone');
    expect(ids(result)).not.toContain('f:ceviche');
    expect(ids(result)).toContain('f:greek-salad');
    expect(result.excluded.recentlyPassed).toBe(2);
  });

  it('brings back a passed recipe the person later liked', () => {
    const feedback: FeedbackEvent[] = [
      { recipeId: 'f:minestrone', kind: 'pass', at: NOW - 3 * DAY_MS, reasons: [] },
      { recipeId: 'f:minestrone', kind: 'save', at: NOW - DAY_MS, reasons: [] },
    ];
    expect(recentlyPassedIds(feedback, NOW, RANKING_CONFIG_V1).size).toBe(0);
  });

  it('leaves out explicitly excluded ids and duplicate candidates', () => {
    const result = deck({
      candidates: [...CATALOG, ...CATALOG],
      exclude: ['f:minestrone'],
      size: 50,
    });
    expect(ids(result)).not.toContain('f:minestrone');
    expect(new Set(ids(result)).size).toBe(result.cards.length);
    expect(result.excluded.excluded).toBe(1);
  });

  it('quick mode only shows dishes ready in 30 minutes', () => {
    const result = deck({ mode: 'quick', size: 50 });
    expect(result.cards.length).toBeGreaterThan(0);
    for (const card of result.cards) expect(card.recipe.totalMinutes).toBeLessThanOrEqual(30);
    expect(result.excluded.outsideMode).toBeGreaterThan(0);
  });

  it('pantry mode only shows dishes mostly covered by the pantry', () => {
    const pantry = ['red_lentil', 'tomato', 'onion', 'carrot', 'cumin_seed', 'chickpea', 'spinach'];
    const result = deck({ mode: 'pantry', pantry, size: 50 });
    // Both dal variants are covered, but only one of a dish family is ever dealt.
    expect(result.cards).toHaveLength(3);
    expect(ids(result)).toEqual(expect.arrayContaining(['f:chana-masala', 'f:red-lentil-soup']));
    expect(result.cards.filter((c) => c.recipe.familyId === 'dal')).toHaveLength(1);
    for (const card of result.cards) {
      expect(card.features.pantryCoverage).toBeGreaterThanOrEqual(0.6);
      expect(card.reasons[0]?.code).toBe('pantry');
    }
  });

  it('pantry mode is empty with an empty pantry', () => {
    const result = deck({ mode: 'pantry' });
    expect(result.cards).toEqual([]);
    expect(result.available).toBe(0);
  });

  it('gentle mode shows gentle dishes at half portions', () => {
    const result = deck({ mode: 'gentle', prefs: { smallAppetite: true }, size: 50 });
    expect(result.cards.length).toBeGreaterThan(0);
    for (const card of result.cards) {
      expect(card.recipe.gentle).toBe(true);
      expect(card.portionScale).toBe(0.5);
    }
  });

  it('suggests smaller portions everywhere for small appetites', () => {
    const result = deck({ prefs: { smallAppetite: true } });
    for (const card of result.cards) expect(card.portionScale).toBe(0.5);
  });

  it('caps cuisines in the first six cards and shows one variant per dish', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const result = deck({ prefs: { cuisines: ['indian'] }, seed, size: 12 });
      const firstSix = result.cards.slice(0, 6).map((c) => c.recipe.cuisine);
      expect(firstSix.filter((c) => c === 'indian').length).toBeLessThanOrEqual(2);
      const families = result.cards.map((c) => c.recipe.familyId);
      expect(new Set(families).size).toBe(families.length);
    }
  });

  it('handles empty input and non-positive sizes', () => {
    expect(deck({ candidates: [] }).cards).toEqual([]);
    expect(deck({ size: 0 }).cards).toEqual([]);
    expect(deck({ size: -3 }).cards).toEqual([]);
  });

  it('pushes recently shown cards back', () => {
    const target = recipe('minestrone');
    const prefs = { cuisines: ['italian'], goals: ['heart_friendly' as const] };
    const config = { ...RANKING_CONFIG_V1, feed: { ...RANKING_CONFIG_V1.feed, temperature: 0 } };
    const fresh = deck({ prefs, config, size: 30 }).cards.find((c) => c.recipe.id === target.id);
    const repeat = deck({ prefs, config, size: 30, shown: [{ recipeId: target.id, at: NOW }] });
    const shownCard = repeat.cards.find((c) => c.recipe.id === target.id);
    expect(shownCard!.score).toBeLessThan(fresh!.score);
    expect(shownCard!.fitScore).toBe(fresh!.fitScore);
  });
});
