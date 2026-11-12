import { defaultPreferences } from '@/stores';

import { chefProfileFrom } from './profile';
import { answeredPrefs } from '../__fixtures__/recipe';

describe('chefProfileFrom', () => {
  it('says the allergen and diet questions are not answered yet instead of "none"', () => {
    const profile = chefProfileFrom({
      ...defaultPreferences,
      allergensAnswered: false,
      // Stray values from before the question was answered are not trusted.
      allergens: ['milk'],
      diets: ['vegan'],
    });
    expect(profile.allergens_answered).toBe(false);
    expect(profile.allergens).toEqual([]);
    expect(profile.diet).toEqual([]);
  });

  it('leaves the flag out once answered, which Chef reads as answered', () => {
    const profile = chefProfileFrom(answeredPrefs({ allergens: ['milk'] }));
    expect('allergens_answered' in profile).toBe(false);
  });

  it('only ever sends lowercase identifiers as diet entries', () => {
    const slug = /^[a-z][a-z0-9_]{0,39}$/;
    for (const prefs of [
      { ...defaultPreferences, allergensAnswered: false },
      answeredPrefs({ diets: ['vegetarian', 'pescatarian'] }),
    ]) {
      for (const entry of chefProfileFrom(prefs).diet) expect(entry).toMatch(slug);
    }
  });

  it('sends an explicit "none" as empty lists once answered', () => {
    const profile = chefProfileFrom(answeredPrefs({ allergens: [], diets: [] }));
    expect(profile.allergens).toEqual([]);
    expect(profile.diet).toEqual([]);
  });

  it('sends the declared allergens and diets once answered', () => {
    const profile = chefProfileFrom(
      answeredPrefs({ allergens: ['peanut', 'sesame'], diets: ['vegetarian'] }),
    );
    expect(profile.allergens).toEqual(['peanut', 'sesame']);
    expect(profile.diet).toEqual(['vegetarian']);
  });

  it('keeps the time budget in range', () => {
    expect(chefProfileFrom(answeredPrefs({ maxMinutes: 2 })).time_budget_minutes).toBe(5);
    expect(chefProfileFrom(answeredPrefs({ maxMinutes: 900 })).time_budget_minutes).toBe(600);
    expect(chefProfileFrom(answeredPrefs({ maxMinutes: null })).time_budget_minutes).toBeNull();
  });
});
