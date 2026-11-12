import type { Substitution } from '@/lib/catalog';

import { ratioLabel, suggestSubstitutions } from './substitutions';
import { ingredient } from '../test/fixtures';

const ingredients = new Map(
  [
    ingredient('butter', { allergens: ['milk'], dietFlags: 1 | 4 | 8 | 32 | 64 }),
    ingredient('olive_oil', { name: 'Olive oil', dietFlags: 511 }),
    ingredient('coconut_oil', { name: 'Coconut oil', dietFlags: 511 }),
    ingredient('ghee_blend', { name: 'Ghee blend', allergenStatus: 'unknown', dietFlags: 511 }),
    ingredient('cashew_cream', { name: 'Cashew cream', allergens: ['tree_nut'], dietFlags: 511 }),
    ingredient('beef_mince', { name: 'Beef mince', dietFlags: 4 | 8 | 16 | 64 | 128 }),
    ingredient('lentils', { name: 'Lentils', dietFlags: 511 }),
    ingredient('white_rice', { name: 'White rice', dietFlags: 511 }),
    ingredient('brown_rice', { name: 'Brown rice', dietFlags: 511 }),
    ingredient('stock', { name: 'Stock', allergenStatus: 'unknown', dietFlags: 0 }),
    ingredient('low_salt_stock', { name: 'Low-salt stock', dietFlags: 511 }),
  ].map((i) => [i.id, i]),
);

const subs: Substitution[] = [
  {
    fromId: 'butter',
    toId: 'olive_oil',
    ratio: 0.75,
    goal: 'lower_sat_fat',
    note: 'Less sat fat.',
  },
  { fromId: 'butter', toId: 'olive_oil', ratio: 0.75, goal: 'allergen', note: 'No milk.' },
  { fromId: 'butter', toId: 'coconut_oil', ratio: 1, goal: 'allergen', note: 'No milk.' },
  { fromId: 'butter', toId: 'ghee_blend', ratio: 1, goal: 'allergen', note: 'Unverified.' },
  { fromId: 'butter', toId: 'cashew_cream', ratio: 1, goal: 'allergen', note: 'Nutty.' },
  { fromId: 'beef_mince', toId: 'lentils', ratio: 1, goal: 'diet', note: 'Plant swap.' },
  { fromId: 'white_rice', toId: 'brown_rice', ratio: 1, goal: 'high_fiber', note: 'More fiber.' },
  { fromId: 'stock', toId: 'low_salt_stock', ratio: 1, goal: 'allergen', note: 'Verified.' },
];

describe('suggestSubstitutions', () => {
  it('offers allergen swaps only to people who avoid that allergen', () => {
    const none = suggestSubstitutions(subs, ingredients, { allergens: [], diets: [], goals: [] });
    expect(none.get('butter')).toBeUndefined();

    const milk = suggestSubstitutions(subs, ingredients, {
      allergens: ['milk', 'tree_nut'],
      diets: [],
      goals: [],
    });
    const butter = milk.get('butter')!;
    expect(butter.map((s) => s.toId)).toEqual(['coconut_oil', 'olive_oil']);
    expect(butter[0]!.label).toBe('Avoids milk');
  });

  it('never suggests a replacement with unverified or conflicting allergens', () => {
    const out = suggestSubstitutions(subs, ingredients, {
      allergens: ['milk', 'tree_nut'],
      diets: [],
      goals: [],
    });
    const ids = (out.get('butter') ?? []).map((s) => s.toId);
    expect(ids).not.toContain('ghee_blend');
    expect(ids).not.toContain('cashew_cream');
  });

  it('drops unverified replacements even before allergens are answered', () => {
    const out = suggestSubstitutions(subs, ingredients, {
      allergens: null,
      diets: null,
      goals: ['more_fiber'],
    });
    expect(out.get('white_rice')!.map((s) => s.toId)).toEqual(['brown_rice']);
    expect(out.get('butter')).toBeUndefined();
  });

  it('offers a verified swap for an ingredient whose allergens are unverified', () => {
    const out = suggestSubstitutions(subs, ingredients, {
      allergens: ['soy'],
      diets: [],
      goals: [],
    });
    expect(out.get('stock')![0]!.label).toBe('Verified allergen-safe swap');
  });

  it('offers diet swaps when the original breaks a followed diet', () => {
    const veg = suggestSubstitutions(subs, ingredients, {
      allergens: [],
      diets: ['vegetarian'],
      goals: [],
    });
    expect(veg.get('beef_mince')![0]).toMatchObject({ toId: 'lentils', label: 'Fits vegetarian' });

    const omni = suggestSubstitutions(subs, ingredients, { allergens: [], diets: [], goals: [] });
    expect(omni.get('beef_mince')).toBeUndefined();
  });

  it('offers goal swaps only for the goals the person chose', () => {
    const fiber = suggestSubstitutions(subs, ingredients, {
      allergens: [],
      diets: [],
      goals: ['more_fiber'],
    });
    expect(fiber.get('white_rice')![0]!.label).toBe('For more fiber');
    expect(fiber.get('butter')).toBeUndefined();

    const heart = suggestSubstitutions(subs, ingredients, {
      allergens: [],
      diets: [],
      goals: ['heart_friendly'],
    });
    expect(heart.get('butter')![0]).toMatchObject({ toId: 'olive_oil' });
  });

  it('puts allergen swaps first and lists each replacement once', () => {
    const out = suggestSubstitutions(subs, ingredients, {
      allergens: ['milk'],
      diets: [],
      goals: ['heart_friendly'],
    });
    const butter = out.get('butter')!;
    expect(butter).toHaveLength(2);
    expect(butter.every((s) => s.reason.kind === 'allergen')).toBe(true);
    expect(new Set(butter.map((s) => s.toId)).size).toBe(2);
  });
});

describe('ratioLabel', () => {
  it('describes common ratios plainly', () => {
    expect(ratioLabel(1)).toBe('Swap 1 for 1');
    expect(ratioLabel(2)).toBe('Use twice as much');
    expect(ratioLabel(0.5)).toBe('Use half as much');
    expect(ratioLabel(0.75)).toBe('Use 75% of the amount');
  });
});
