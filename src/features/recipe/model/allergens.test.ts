import { DietFlag, type AllergenId } from '@/domain';

import { dietBadges, lineAllergenNotes, summariseAllergens } from './allergens';
import { allergenMap } from '../test/fixtures';

describe('summariseAllergens', () => {
  it('says plainly when a declared allergen could not be verified', () => {
    const summary = summariseAllergens(allergenMap({ milk: 'unknown' }), ['milk']);
    expect(summary.conflict).toBe(true);
    expect(summary.yours).toEqual([
      expect.objectContaining({ allergen: 'milk', label: 'Milk: not verified', tone: 'warning' }),
    ]);
    expect(summary.headline).toBe("We couldn't verify this recipe against your allergies");
  });

  it('never reads a missing entry as free', () => {
    const summary = summariseAllergens({ milk: 'free' }, ['egg']);
    expect(summary.yours[0]).toMatchObject({ allergen: 'egg', status: 'unknown' });
    expect(summary.conflict).toBe(true);
    expect(summary.unverified.map((b) => b.allergen)).toContain('peanut');
  });

  it('flags declared allergens the recipe contains as danger', () => {
    const summary = summariseAllergens(allergenMap({ peanut: 'contains' }), ['peanut']);
    expect(summary.yours[0]).toMatchObject({ label: 'Contains peanuts', tone: 'danger' });
    expect(summary.headline).toBe('Contains something you avoid');
  });

  it('lists other contained and unverified allergens separately', () => {
    const summary = summariseAllergens(
      allergenMap({ wheat: 'contains', gluten: 'contains', sesame: 'unknown' }),
      ['milk'],
    );
    expect(summary.conflict).toBe(false);
    expect(summary.yours[0]).toMatchObject({ label: 'No milk', tone: 'safe' });
    expect(summary.contains.map((b) => b.allergen)).toEqual(['wheat', 'gluten']);
    expect(summary.unverified.map((b) => b.label)).toEqual(['Sesame: not verified']);
  });

  it('asks for allergies when the person has not answered', () => {
    const summary = summariseAllergens(allergenMap({ soy: 'unknown' }), null);
    expect(summary.yours).toEqual([]);
    expect(summary.conflict).toBe(false);
    expect(summary.headline).toMatch(/Add your allergies/);
    expect(summary.unverified.map((b) => b.allergen)).toEqual(['soy']);
  });

  it('treats a missing map as entirely unverified', () => {
    const summary = summariseAllergens(null, []);
    expect(summary.unverified).toHaveLength(10);
  });
});

describe('dietBadges', () => {
  it('shows verified diets and implied ones', () => {
    const badges = dietBadges(DietFlag.vegan | DietFlag.dairy_free, allergenMap());
    expect(badges.filter((b) => b.status === 'fits').map((b) => b.diet)).toEqual(
      expect.arrayContaining(['vegan', 'vegetarian', 'pescatarian', 'dairy_free']),
    );
  });

  it('marks a diet unverified when an allergen that could disprove it is unknown', () => {
    const badges = dietBadges(DietFlag.vegan, allergenMap({ milk: 'unknown' }));
    expect(badges.find((b) => b.diet === 'vegan')).toEqual({
      diet: 'vegan',
      status: 'unverified',
      label: 'Vegan: not verified',
    });
    // Vegetarian does not depend on allergen data, so it still shows.
    expect(badges.find((b) => b.diet === 'vegetarian')?.status).toBe('fits');
  });

  it('drops a diet the allergen data contradicts', () => {
    const badges = dietBadges(DietFlag.gluten_free, allergenMap({ wheat: 'contains' }));
    expect(badges.find((b) => b.diet === 'gluten_free')).toBeUndefined();
  });
});

describe('lineAllergenNotes', () => {
  const ingredients = new Map([
    ['satay_sauce', { allergens: ['peanut', 'soy', 'milk'] as AllergenId[] }],
    ['rice', { allergens: [] as AllergenId[] }],
  ]);

  it('notes declared allergens a line contains, in vocabulary order', () => {
    const notes = lineAllergenNotes(ingredients, ['peanut', 'milk']);
    expect(notes.get('satay_sauce')).toBe('Contains milk and peanuts');
    expect(notes.has('rice')).toBe(false);
  });

  it('adds nothing when no allergens are declared or the question is unanswered', () => {
    expect(lineAllergenNotes(ingredients, []).size).toBe(0);
    expect(lineAllergenNotes(ingredients, null).size).toBe(0);
  });
});
