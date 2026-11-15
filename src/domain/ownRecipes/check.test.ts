import {
  checkOwnRecipe,
  confirmIngredient,
  ingredientKey,
  isClearedForSuggestions,
  pruneConfirmations,
  unconfirmIngredient,
  type CatalogFacts,
  type IngredientConfirmation,
  type OwnIngredient,
} from './check';
import type { SafetyPrefs } from '../safety';
import { DietFlag, dietMask, DIET_FLAG_NAMES } from '../types/diet';

const ALL_DIETS = dietMask(DIET_FLAG_NAMES);
const MEAT_DIETS = ALL_DIETS & ~(DietFlag.vegetarian | DietFlag.vegan | DietFlag.pescatarian);

function facts(id: string, overrides: Partial<CatalogFacts> = {}): CatalogFacts {
  return {
    id,
    name: id.replace(/_/g, ' '),
    plural: null,
    allergens: [],
    allergenStatus: 'resolved',
    dietFlags: ALL_DIETS,
    pantryStaple: false,
    ...overrides,
  };
}

const CATALOG = new Map<string, CatalogFacts>(
  [
    facts('garlic'),
    facts('rice'),
    facts('cane_vinegar'),
    facts('soy_sauce', {
      allergens: ['soy', 'wheat', 'gluten'],
      dietFlags: ALL_DIETS & ~DietFlag.gluten_free,
    }),
    facts('chicken_thigh', { name: 'chicken thigh', dietFlags: MEAT_DIETS }),
    facts('butter', {
      allergens: ['milk'],
      dietFlags: ALL_DIETS & ~(DietFlag.vegan | DietFlag.dairy_free),
    }),
    facts('peanut_butter', { allergens: ['peanut'] }),
    facts('almond_milk', { allergens: ['tree_nut'] }),
    facts('vegetable_stock', { allergenStatus: 'unknown', dietFlags: DietFlag.no_alcohol }),
    facts('salt', { pantryStaple: true }),
  ].map((entry) => [entry.id, entry]),
);

const line = (text: string, name: string, catalogIngredientId: string | null): OwnIngredient => ({
  text,
  name,
  catalogIngredientId,
});

const GARLIC = line('1 head garlic', 'garlic', 'garlic');
const RICE = line('4 cups cooked rice', 'rice', 'rice');
const VINEGAR = line('1/3 cup Datu Puti vinegar', 'cane vinegar', null);
const SOY = line('1/3 cup soy sauce', 'soy sauce', 'soy_sauce');

const prefs = (allergens: SafetyPrefs['allergens'], diets: SafetyPrefs['diets'] = []) => ({
  allergens,
  diets,
});

function check(
  ingredients: readonly OwnIngredient[],
  person: SafetyPrefs,
  confirmations: readonly IngredientConfirmation[] = [],
) {
  return checkOwnRecipe({ ingredients, catalog: CATALOG, prefs: person, confirmations });
}

describe('checkOwnRecipe', () => {
  it('clears a recipe whose every line is matched, resolved and free of declared allergens', () => {
    const safety = check([GARLIC, RICE], prefs(['peanut'], ['vegan']));
    expect(safety.status).toBe('clear');
    expect(safety.cleared).toBe(2);
    expect(isClearedForSuggestions(safety)).toBe(true);
  });

  describe('fails closed', () => {
    it('keeps a recipe with an unmatched line out of suggestions', () => {
      const safety = check([GARLIC, VINEGAR], prefs(['milk']));
      expect(safety.status).toBe('needs_check');
      expect(isClearedForSuggestions(safety)).toBe(false);
      expect(safety.toConfirm).toBe(0);
      expect(safety.unverifiable).toBe(1);
      expect(safety.ingredients[1]).toMatchObject({
        verdict: 'unverifiable',
        catalog: null,
        issues: expect.arrayContaining([
          { code: 'unmatched' },
          { code: 'allergen_unverified', allergen: 'milk' },
        ]),
      });
    });

    it('needs a check for an unmatched line even when nothing is declared', () => {
      const safety = check([VINEGAR], prefs([], []));
      expect(safety.status).toBe('needs_check');
      expect(safety.ingredients[0]?.issues).toEqual([{ code: 'unmatched' }]);
    });

    it('needs a check for a product whose contents vary', () => {
      const stock = line('2 cups vegetable stock', 'vegetable stock', 'vegetable_stock');
      const safety = check([stock], prefs(['wheat'], ['vegetarian']));
      expect(safety.status).toBe('needs_check');
      expect(safety.ingredients[0]?.issues).toEqual([
        { code: 'composition_unknown' },
        { code: 'allergen_unverified', allergen: 'wheat' },
        { code: 'diet_unverified', diet: 'vegetarian' },
      ]);
    });

    it('treats a stored catalog id the catalog no longer has as unmatched', () => {
      const gone = line('1 cup quinoa', 'quinoa', 'quinoa');
      expect(check([gone], prefs([])).ingredients[0]).toMatchObject({
        verdict: 'needs_check',
        issues: [{ code: 'unmatched' }],
      });
    });

    it('treats a stored catalog id that does not name the same food as unmatched', () => {
      const wrong = line('2 tbsp peanut butter', 'peanut butter', 'butter');
      const safety = check([wrong], prefs(['peanut']));
      expect(safety.ingredients[0]?.catalog).toBeNull();
      expect(safety.status).toBe('needs_check');
    });

    it('flags a line that mentions an allergen its match does not account for', () => {
      const either = line('1 cup butter, or peanut butter', 'butter', 'butter');
      const safety = check([either], prefs(['peanut']));
      expect(safety.ingredients[0]).toMatchObject({
        verdict: 'unverifiable',
        issues: [{ code: 'allergen_unverified', allergen: 'peanut' }],
      });
    });

    it('does not flag allergen words the match itself explains', () => {
      const almond = line('1 cup almond milk', 'almond milk', 'almond_milk');
      expect(check([almond], prefs(['milk'])).status).toBe('clear');
    });

    it('flags meat words for diets that rule meat out', () => {
      const broth = line('1 cup rice, cooked in broth', 'rice', 'rice');
      const safety = check([broth], prefs([], ['vegetarian']));
      expect(safety.ingredients[0]?.issues).toEqual([
        { code: 'diet_unverified', diet: 'vegetarian' },
      ]);
    });

    it('admits nothing while the allergen and diet questions are unanswered', () => {
      const safety = check([GARLIC, RICE], prefs(null, null));
      expect(safety.status).toBe('needs_check');
      expect(safety.unanswered).toBe(true);
      expect(safety.toConfirm).toBe(0);
      expect(isClearedForSuggestions(safety)).toBe(false);
    });

    it('ignores confirmations while the questions are unanswered', () => {
      const confirmation = { key: ingredientKey(VINEGAR), allergens: [], diets: [], at: 'x' };
      expect(check([VINEGAR], prefs(null, null), [confirmation]).status).toBe('needs_check');
    });

    it('never clears a recipe without ingredients', () => {
      expect(check([], prefs([])).status).toBe('needs_check');
    });
  });

  describe('conflicts', () => {
    it('reports a declared allergen as a conflict', () => {
      const safety = check([GARLIC, SOY], prefs(['soy']));
      expect(safety.status).toBe('conflict');
      expect(safety.conflicts).toBe(1);
      expect(safety.ingredients[1]).toMatchObject({
        verdict: 'conflict',
        issues: [{ code: 'contains_allergen', allergen: 'soy' }],
      });
    });

    it('reports an ingredient the diet rules out as a conflict', () => {
      const chicken = line('2 lb chicken thighs', 'chicken thighs', 'chicken_thigh');
      expect(check([chicken], prefs([], ['vegetarian'])).ingredients[0]).toMatchObject({
        verdict: 'conflict',
        issues: [{ code: 'diet_conflict', diet: 'vegetarian' }],
      });
    });

    it('reports an allergen that disproves a diet as a diet conflict', () => {
      const butter = line('2 tbsp butter', 'butter', 'butter');
      expect(check([butter], prefs([], ['vegan'])).ingredients[0]?.issues).toContainEqual({
        code: 'diet_conflict',
        diet: 'vegan',
      });
    });

    it('cannot be confirmed away', () => {
      const person = prefs(['soy']);
      const confirmations = confirmIngredient([], ingredientKey(SOY), person, 'now') ?? [];
      const safety = check([SOY], person, confirmations);
      expect(safety.status).toBe('conflict');
      expect(safety.ingredients[0]?.verdict).toBe('conflict');
      expect(isClearedForSuggestions(safety)).toBe(false);
    });

    it('outranks lines that only need a check', () => {
      expect(check([VINEGAR, SOY], prefs(['wheat'])).status).toBe('conflict');
    });
  });

  describe('confirmations', () => {
    it('clears a confirmed line and with it the recipe', () => {
      const person = prefs([], ['pescatarian']);
      const confirmations = confirmIngredient([], ingredientKey(VINEGAR), person, 'now') ?? [];
      const safety = check([GARLIC, VINEGAR], person, confirmations);
      expect(safety.ingredients[1]?.verdict).toBe('confirmed');
      expect(safety.status).toBe('clear');
      expect(isClearedForSuggestions(safety)).toBe(true);
    });

    it('stops counting once the person declares an allergen the check did not cover', () => {
      const confirmations = confirmIngredient([], ingredientKey(VINEGAR), prefs([]), 'now') ?? [];
      const safety = check([VINEGAR], prefs(['sesame']), confirmations);
      expect(safety.ingredients[0]?.verdict).toBe('unverifiable');
      expect(safety.status).toBe('needs_check');
    });

    it('stops counting once the person follows a diet the check did not cover', () => {
      const confirmations = confirmIngredient([], ingredientKey(VINEGAR), prefs([]), 'now') ?? [];
      expect(check([VINEGAR], prefs([], ['vegan']), confirmations).status).toBe('needs_check');
    });

    it('still counts when the person follows fewer diets than they checked for', () => {
      const confirmations =
        confirmIngredient([], ingredientKey(VINEGAR), prefs([], ['vegan', 'no_alcohol']), 'now') ??
        [];
      expect(check([VINEGAR], prefs([], ['vegan']), confirmations).status).toBe('clear');
    });

    it('belongs to the line as written: editing the line needs a new check', () => {
      const person = prefs([]);
      const confirmations = confirmIngredient([], ingredientKey(VINEGAR), person, 'now') ?? [];
      const edited = { ...VINEGAR, text: '1/2 cup Datu Puti vinegar' };
      expect(check([edited], person, confirmations).status).toBe('needs_check');
    });

    it('is refused while the safety questions are unanswered', () => {
      expect(confirmIngredient([], 'k', prefs(null, null), 'now')).toBeNull();
    });

    it('replaces an older confirmation of the same line and can be taken back', () => {
      const first = confirmIngredient([], 'k', prefs(['milk']), 'a') ?? [];
      const second = confirmIngredient(first, 'k', prefs(['milk', 'egg']), 'b') ?? [];
      expect(second).toEqual([{ key: 'k', allergens: ['milk', 'egg'], diets: [], at: 'b' }]);
      expect(unconfirmIngredient(second, 'k')).toEqual([]);
    });

    it('are pruned for lines that left the recipe', () => {
      const kept = { key: ingredientKey(VINEGAR), allergens: [], diets: [], at: 'a' };
      const stale = { key: 'old|line', allergens: [], diets: [], at: 'a' };
      expect(pruneConfirmations([kept, stale], [VINEGAR, GARLIC])).toEqual([kept]);
    });
  });
});

describe('review fixes', () => {
  describe('a manual check never clears a declared allergen', () => {
    const SAUCE = line('2 tbsp mystery sauce', 'mystery sauce', null);

    it('cannot confirm an unmatched line for someone with a declared allergen', () => {
      const person = prefs(['peanut']);
      const confirmations = confirmIngredient([], ingredientKey(SAUCE), person, 'now') ?? [];
      const safety = check([GARLIC, SAUCE], person, confirmations);
      expect(safety.ingredients[1]?.verdict).toBe('unverifiable');
      expect(safety.status).toBe('needs_check');
      expect(safety.toConfirm).toBe(0);
      expect(safety.unverifiable).toBe(1);
      expect(isClearedForSuggestions(safety)).toBe(false);
    });

    it('cannot confirm a product whose contents vary for someone with a declared allergen', () => {
      const stock = line('2 cups vegetable stock', 'vegetable stock', 'vegetable_stock');
      const person = prefs(['wheat']);
      const confirmations = confirmIngredient([], ingredientKey(stock), person, 'now') ?? [];
      expect(check([stock], person, confirmations).ingredients[0]?.verdict).toBe('unverifiable');
    });

    it('still lets someone without allergens confirm an unmatched line', () => {
      const person = prefs([], ['vegan']);
      const confirmations = confirmIngredient([], ingredientKey(SAUCE), person, 'now') ?? [];
      const safety = check([SAUCE], person, confirmations);
      expect(safety.ingredients[0]?.verdict).toBe('confirmed');
      expect(isClearedForSuggestions(safety)).toBe(true);
    });

    it('still lets a diet-only doubt be confirmed', () => {
      const rice = line('1 cup rice with bacon bits', 'rice', 'rice');
      const person = prefs([], ['vegetarian']);
      expect(check([rice], person).ingredients[0]?.issues).toEqual([
        { code: 'diet_unverified', diet: 'vegetarian' },
      ]);
      const confirmations = confirmIngredient([], ingredientKey(rice), person, 'now') ?? [];
      const safety = check([rice], person, confirmations);
      expect(safety.ingredients[0]?.verdict).toBe('confirmed');
      expect(isClearedForSuggestions(safety)).toBe(true);
    });
  });

  describe('words the match does not explain', () => {
    it('subtracts the matched name once, so a repeated allergen word still counts', () => {
      const milk = line('1 cup almond milk (may contain milk)', 'almond milk', 'almond_milk');
      const safety = check([milk], prefs(['milk']));
      expect(safety.ingredients[0]?.issues).toContainEqual({
        code: 'allergen_unverified',
        allergen: 'milk',
      });
      expect(isClearedForSuggestions(safety)).toBe(false);
    });

    it('always reads a "may contain" or "traces of" note for allergens', () => {
      const rice = line('4 cups rice (traces of sesame)', 'rice', 'rice');
      expect(check([rice], prefs(['sesame'])).status).not.toBe('clear');
      const contains = line('2 cups rice, contains soy', 'rice', 'rice');
      expect(check([contains], prefs(['soy'])).status).not.toBe('clear');
    });

    it('does not let a resolved base ingredient vouch for a stock it was cooked in', () => {
      const rice = line('1 cup rice, cooked in vegetable stock', 'rice', 'rice');
      const safety = check([rice], prefs(['soy']));
      expect(safety.ingredients[0]?.issues).toContainEqual({
        code: 'allergen_unverified',
        allergen: 'soy',
      });
      expect(safety.ingredients[0]?.verdict).toBe('unverifiable');
    });

    it('flags sauces, pastes, dressings and marinades on the line', () => {
      for (const extra of ['tossed in sauce', 'with curry paste', 'with dressing', 'in marinade']) {
        const rice = line(`1 cup rice ${extra}`, 'rice', 'rice');
        expect(check([rice], prefs(['peanut'])).status).not.toBe('clear');
      }
    });

    it('still clears a plain line whose only words are its match', () => {
      expect(
        check([line('1 cup almond milk', 'almond milk', 'almond_milk')], prefs(['milk'])).status,
      ).toBe('clear');
    });
  });
});

describe('review fixes, round two: only known non-food words may be left over', () => {
  const unverified = (text: string, name: string, id: string | null, allergen: 'milk' | 'soy') => {
    const safety = check([line(text, name, id)], prefs([allergen]));
    expect(safety.ingredients[0]?.issues).toContainEqual({ code: 'allergen_unverified', allergen });
    expect(isClearedForSuggestions(safety)).toBe(false);
  };

  it('subtracts only a catalog name actually written in the line', () => {
    unverified('1 cup milk', 'almond milk', 'almond_milk', 'milk');
  });

  it('does not clear a food it has no word for', () => {
    unverified('1 cup rice with gochujang', 'rice', 'rice', 'soy');
    unverified('1 cup rice with mascarpone', 'rice', 'rice', 'milk');
  });

  it('reads every word of an allergen note', () => {
    unverified('1 cup rice (may contain vegetable stock)', 'rice', 'rice', 'soy');
  });

  it('flags the extra food in the name as well as the text', () => {
    unverified('1 cup rice', 'rice and mascarpone', 'rice', 'milk');
  });

  it('still clears lines whose only extra words are amounts, units and preparation', () => {
    const lines = [
      line('2 1/2 cups cooked rice, rinsed and drained', 'rice', 'rice'),
      line('6 large cloves garlic, peeled and finely minced', 'garlic', 'garlic'),
      line('1 head garlic, roughly chopped (optional)', 'garlic', 'garlic'),
      line('Salt, to taste', 'salt', 'salt'),
      line('1/3 cup soy sauce, divided', 'soy sauce', 'soy_sauce'),
      line(
        '500 g boneless chicken thighs, cut into bite-sized pieces',
        'chicken thigh',
        'chicken_thigh',
      ),
    ];
    const safety = check(lines, prefs(['peanut']));
    expect(safety.ingredients.map((entry) => entry.verdict)).toEqual(lines.map(() => 'clear'));
  });

  it('makes a diet unverified too when an unknown food is left over', () => {
    const safety = check([line('1 cup rice with gochujang', 'rice', 'rice')], prefs([], ['vegan']));
    expect(safety.ingredients[0]?.issues).toContainEqual({
      code: 'diet_unverified',
      diet: 'vegan',
    });
  });
});

describe('ingredientKey', () => {
  it('ignores case, punctuation and plurals in the name', () => {
    expect(ingredientKey({ text: '3 Bay Leaves!', name: 'Bay leaves' })).toBe(
      ingredientKey({ text: '3 bay leaves', name: 'bay leaf' }),
    );
  });
});
