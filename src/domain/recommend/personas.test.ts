/**
 * Persona harness: realistic people against the fixture catalog. These tests assert behaviour a
 * person would notice (safety, sensible top picks, modes), not exact scores, so tuning the config
 * should only break them when recommendations actually get worse.
 */
import { buildDeck, type DeckMode } from './deck';
import { CATALOG, recipe } from './fixtures/catalog';
import { rankRecipes } from './rank';
import { DAY_MS } from './taste';
import { satisfiesDiet, dietMask } from '../types/diet';
import { type FeedbackEvent } from '../types/feedback';
import { userPreferencesSchema, type UserPreferences } from '../types/preferences';

const NOW = Date.UTC(2026, 10, 1, 18);

interface Persona {
  readonly prefs: UserPreferences;
  readonly pantry?: readonly string[];
  readonly feedback?: readonly FeedbackEvent[];
}

const SEEDS = ['mon', 'tue', 'wed', 'thu', 'fri'];

function topIds(persona: Persona, n: number) {
  return rankRecipes(
    CATALOG,
    {
      prefs: persona.prefs,
      now: NOW,
      pantry: persona.pantry ?? [],
      feedback: persona.feedback ?? [],
    },
    n,
  ).map((entry) => entry.recipe.id);
}

function decks(persona: Persona, mode: DeckMode, size = 6) {
  return SEEDS.map((seed) =>
    buildDeck({
      candidates: CATALOG,
      prefs: persona.prefs,
      now: NOW,
      pantry: persona.pantry ?? [],
      feedback: persona.feedback ?? [],
      mode,
      seed,
      size,
    }),
  );
}

describe('persona: vegetarian home cook who loves South Asian food and wants more protein', () => {
  const persona: Persona = {
    prefs: userPreferencesSchema.parse({
      cuisines: ['indian', 'pakistani'],
      diets: ['vegetarian'],
      goals: ['more_protein'],
      timeBudgetMinutes: 30,
      effort: 2,
    }),
  };

  it('only ever sees vegetarian dishes', () => {
    for (const deck of decks(persona, 'forYou', 20)) {
      for (const card of deck.cards) {
        expect(satisfiesDiet(card.recipe.dietFlags, dietMask(['vegetarian']))).toBe(true);
      }
    }
  });

  it('ranks protein-rich Indian vegetarian dishes first', () => {
    const top = topIds(persona, 3);
    expect(top).toContain('f:chana-masala');
    expect(top.filter((id) => CATALOG.find((r) => r.id === id)?.cuisine === 'indian').length).toBe(
      3,
    );
  });

  it('explains picks in terms of the person’s goal and time budget', () => {
    // Indian dishes are capped at two per six cards, so look through a longer deck.
    const deck = decks(persona, 'forYou', 20)[0]!;
    const card = deck.cards.find((c) => c.recipe.id === 'f:chana-masala');
    const texts = card?.reasons.map((r) => r.text) ?? [];
    expect(texts).toEqual(
      expect.arrayContaining(['High in protein for your goal', 'Fits your 30-minute weeknights']),
    );
    expect(card!.fitScore).toBeGreaterThanOrEqual(75);
  });
});

describe('persona: peanut and milk allergies, loves Mexican and Thai, watching sodium', () => {
  const persona: Persona = {
    prefs: userPreferencesSchema.parse({
      cuisines: ['mexican', 'thai'],
      allergens: ['peanut', 'milk'],
      goals: ['lower_sodium'],
      timeBudgetMinutes: 45,
    }),
  };
  const unsafe = ['f:pad-thai', 'f:summer-rolls', 'f:green-curry-tofu', 'f:black-bean-tacos'];

  it('never sees a dish that contains or may contain their allergens', () => {
    for (const mode of ['forYou', 'quick'] as const) {
      for (const deck of decks(persona, mode, 30)) {
        for (const card of deck.cards) {
          expect(unsafe).not.toContain(card.recipe.id);
          expect(card.recipe.allergens.peanut).toBe('free');
          expect(card.recipe.allergens.milk).toBe('free');
        }
      }
    }
  });

  it('hides the store-bought stock dish whose allergens are unverified', () => {
    expect(topIds(persona, 50)).not.toContain('f:stock-cube-stew');
  });

  it('leads with safe dishes from the cuisines they love and their neighbours', () => {
    expect(topIds(persona, 1)).toEqual(['f:chicken-fajitas']);
    for (const deck of decks(persona, 'forYou')) {
      const firstTwo = deck.cards.slice(0, 2).map((c) => c.recipe);
      expect(firstTwo.map((r) => r.id)).toContain('f:chicken-fajitas');
      for (const r of firstTwo) expect(['latin_america', 'southeast_asia']).toContain(r.region);
    }
  });
});

describe('persona: small appetite, loves British and Irish food, heart health', () => {
  const persona: Persona = {
    prefs: userPreferencesSchema.parse({
      cuisines: ['british', 'irish'],
      goals: ['heart_friendly', 'lighter_meals'],
      effort: 1,
      smallAppetite: true,
    }),
  };

  it('gentle mode offers only gentle dishes at half portions', () => {
    for (const deck of decks(persona, 'gentle', 10)) {
      expect(deck.cards.length).toBeGreaterThan(0);
      for (const card of deck.cards) {
        expect(card.recipe.gentle).toBe(true);
        expect(card.portionScale).toBe(0.5);
      }
    }
  });

  it('favours easy, gentle, heart-friendly dishes near what they love', () => {
    const top = topIds(persona, 4);
    expect(top).toEqual(expect.arrayContaining(['f:oat-porridge', 'f:leek-potato-soup']));
    expect(top).not.toContain('f:butter-chicken');
    expect(top).not.toContain('f:pork-pozole');
  });
});

describe('persona: pescatarian who loves Japanese food and has cooked a lot', () => {
  const persona: Persona = {
    prefs: userPreferencesSchema.parse({
      cuisines: ['japanese'],
      diets: ['pescatarian'],
      goals: ['more_protein'],
      timeBudgetMinutes: 30,
    }),
    pantry: ['salmon', 'soy_sauce', 'mirin', 'rice', 'broccoli', 'white_fish', 'lime', 'red_onion'],
    feedback: [
      { recipeId: recipe('salmon-teriyaki').id, kind: 'like', at: NOW - 10 * DAY_MS, reasons: [] },
      { recipeId: recipe('ceviche').id, kind: 'cooked', at: NOW - 12 * DAY_MS, reasons: [] },
      {
        recipeId: recipe('miso-soup').id,
        kind: 'not_for_me',
        at: NOW - 3 * DAY_MS,
        reasons: ['dislike_ingredient'],
        ingredientId: 'tofu',
      },
      { recipeId: recipe('vegetable-udon').id, kind: 'pass', at: NOW - DAY_MS, reasons: [] },
    ],
  };

  it('respects the pescatarian diet', () => {
    for (const deck of decks(persona, 'forYou', 20)) {
      for (const card of deck.cards) {
        expect(satisfiesDiet(card.recipe.dietFlags, dietMask(['pescatarian']))).toBe(true);
      }
    }
  });

  it('does not show dishes they just turned down', () => {
    for (const deck of decks(persona, 'forYou', 20)) {
      const ids = deck.cards.map((c) => c.recipe.id);
      expect(ids).not.toContain('f:miso-soup');
      expect(ids).not.toContain('f:vegetable-udon');
    }
  });

  it('learns from feedback: tofu dishes drop, liked fish dishes rise', () => {
    const top = topIds(persona, 3);
    expect(top[0]).toBe('f:salmon-teriyaki');
    expect(top).toContain('f:ceviche');
    const all = topIds(persona, 50);
    expect(all.indexOf('f:green-curry-tofu')).toBeGreaterThan(all.indexOf('f:salmon-teriyaki'));
  });

  it('pantry mode suggests what they can cook with what they have', () => {
    for (const deck of decks(persona, 'pantry')) {
      const ids = deck.cards.map((c) => c.recipe.id).sort();
      expect(ids).toEqual(['f:ceviche', 'f:salmon-teriyaki']);
      for (const card of deck.cards) expect(card.reasons[0]?.code).toBe('pantry');
    }
  });
});
