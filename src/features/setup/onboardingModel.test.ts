import { userPreferencesSchema } from '@/domain/types';

import {
  STEP_IDS,
  canContinue,
  draftFrom,
  emptyDraft,
  isOptional,
  setNoAllergens,
  skipStep,
  toAnswers,
  toggleAllergen,
  toggleCuisine,
  toggleDiet,
  type Draft,
} from './onboardingModel';
import { cuisineLabel, groupCuisines } from './options';

const withAllergensAnswered: Draft = { ...emptyDraft, noAllergens: true };

describe('steps', () => {
  it('asks ten questions, one per screen', () => {
    expect(STEP_IDS).toHaveLength(10);
  });

  it('never lets the allergen question be skipped', () => {
    expect(isOptional('allergens')).toBe(false);
    expect(canContinue('allergens', emptyDraft)).toBe(false);
    expect(canContinue('allergens', withAllergensAnswered)).toBe(true);
    expect(canContinue('allergens', toggleAllergen(emptyDraft, 'peanut', true))).toBe(true);
  });

  it('needs an answer before continuing on optional questions', () => {
    expect(canContinue('time', emptyDraft)).toBe(false);
    expect(canContinue('time', { ...emptyDraft, timeChosen: true, timeBudgetMinutes: null })).toBe(
      true,
    );
    expect(canContinue('effort', { ...emptyDraft, effort: 1 })).toBe(true);
    expect(canContinue('name', { ...emptyDraft, displayName: '  ' })).toBe(false);
  });

  it('lets diet continue empty, meaning no restrictions', () => {
    expect(canContinue('diet', emptyDraft)).toBe(true);
  });

  it('clears an answer when its question is skipped', () => {
    const picked = { ...emptyDraft, goals: ['more_fiber' as const], displayName: 'Ana' };
    expect(skipStep('goals', picked).goals).toEqual([]);
    expect(skipStep('name', picked).displayName).toBe('');
    expect(skipStep('allergens', picked)).toBe(picked);
  });
});

describe('answers', () => {
  it('caps cuisines at five', () => {
    let draft = emptyDraft;
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) draft = toggleCuisine(draft, id, true);
    expect(draft.cuisines).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(toggleCuisine(draft, 'a', false).cuisines).toEqual(['b', 'c', 'd', 'e']);
  });

  it('makes "no allergies" and specific allergens exclusive', () => {
    const none = setNoAllergens(toggleAllergen(emptyDraft, 'milk', true), true);
    expect(none).toMatchObject({ allergens: [], noAllergens: true });
    expect(toggleAllergen(none, 'egg', true)).toMatchObject({
      allergens: ['egg'],
      noAllergens: false,
    });
  });

  it('keeps diets consistent', () => {
    const vegan = toggleDiet(toggleDiet(emptyDraft, 'vegetarian', true), 'vegan', true);
    expect(vegan.diets).toEqual(['vegan']);
    expect(toggleDiet(vegan, 'pescatarian', true).diets).toEqual(['pescatarian']);
    expect(toggleDiet(vegan, 'no_alcohol', true).diets).toEqual(['vegan', 'no_alcohol']);
  });

  it('turns a finished draft into saved preferences', () => {
    expect(
      toAnswers({
        ...withAllergensAnswered,
        displayName: '  Ana  ',
        cuisines: ['thai'],
        timeChosen: true,
        timeBudgetMinutes: 30,
        householdSize: 40,
      }),
    ).toEqual({
      displayName: 'Ana',
      cuisines: ['thai'],
      diets: [],
      allergens: [],
      goals: [],
      timeBudgetMinutes: 30,
      effort: null,
      householdSize: 20,
      pantryStaples: [],
      smallAppetite: false,
    });
  });

  it('uses the shared preference fields, so the answers fit the preferences schema', () => {
    const answers = toAnswers({
      ...withAllergensAnswered,
      cuisines: ['thai', 'Not A Cuisine'],
      timeChosen: true,
      timeBudgetMinutes: 45,
      effort: 3,
      householdSize: 6,
    });
    expect(answers.cuisines).toEqual(['thai']);
    const { displayName: _name, pantryStaples: _pantry, ...shared } = answers;
    expect(userPreferencesSchema.parse({ ...shared, effort: shared.effort ?? undefined })).toEqual(
      expect.objectContaining({
        cuisines: ['thai'],
        timeBudgetMinutes: 45,
        effort: 3,
        householdSize: 6,
      }),
    );
  });

  it('refuses to finish without an allergen answer', () => {
    expect(() => toAnswers(emptyDraft)).toThrow(/Allergens/);
  });

  it('prefills from saved answers and a suggested name', () => {
    expect(draftFrom(null, 'Kofi').displayName).toBe('Kofi');
    const saved = toAnswers({ ...withAllergensAnswered, goals: ['more_protein'] });
    expect(draftFrom(saved, 'Kofi')).toMatchObject({
      displayName: 'Kofi',
      goals: ['more_protein'],
      noAllergens: true,
      timeChosen: true,
    });
  });
});

describe('groupCuisines', () => {
  const options = [
    { id: 'west_african', region: 'sub_saharan_africa' },
    { id: 'thai', region: 'southeast_asia' },
    { id: 'american', region: 'north_america' },
    { id: 'vietnamese', region: 'southeast_asia' },
  ];

  it('groups by region in geographic order', () => {
    expect(groupCuisines(options, '').map((s) => s.label)).toEqual([
      'North America',
      'Sub-Saharan Africa',
      'Southeast Asia',
    ]);
    expect(cuisineLabel('west_african')).toBe('West African');
  });

  it('searches cuisine and region names, ignoring case and accents', () => {
    expect(groupCuisines(options, 'VIET')[0]?.cuisines.map((c) => c.id)).toEqual(['vietnamese']);
    expect(groupCuisines(options, 'southeast')[0]?.cuisines).toHaveLength(2);
    expect(groupCuisines(options, 'zzz')).toEqual([]);
  });
});
