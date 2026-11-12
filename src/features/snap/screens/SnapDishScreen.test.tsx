import { screen, userEvent } from '@testing-library/react-native';

import type { SnapDish } from '@/lib/api/ai';
import { searchRecipes } from '@/lib/catalog/queries';
import { defaultPreferences, useCookLogStore, usePreferencesStore } from '@/stores';

import type * as TestingModule from '../testing';
import { SnapDishScreen } from './SnapDishScreen';
import { useSnapSession } from '../snapSession';
import { catalogRecipe, mockRouter, renderScreen } from '../testing';

jest.mock('expo-router', () => ({
  router: jest.requireActual<typeof TestingModule>('../testing').mockRouter,
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));
jest.mock('@/lib/catalog/queries', () => ({ searchRecipes: jest.fn() }));

const range = (estimate: number) => ({ estimate, low: estimate * 0.8, high: estimate * 1.2 });

const dish: SnapDish = {
  name: 'pad thai',
  cuisine: 'Thai',
  key_ingredients: ['rice noodles', 'peanut', 'egg'],
  portion: 'one restaurant plate',
  nutrition: {
    kcal: range(900),
    protein_g: range(30),
    carbs_g: range(110),
    fat_g: range(35),
    fiber_g: range(4),
    sodium_mg: range(2000),
  },
  nutrition_confidence: 'estimated',
  confidence: 0.84,
};

const classic = catalogRecipe({
  id: 'r:classic',
  title: 'Pad thai',
  cuisine: 'thai',
  nutrition: { ...catalogRecipe({ id: 'x', title: 'x' }).nutrition!, kcal: 880, sodiumMg: 1900 },
  allergens: { ...catalogRecipe({ id: 'x', title: 'x' }).allergens, peanut: 'contains' },
});
const lighter = catalogRecipe({
  id: 'r:lighter',
  title: 'Lighter pad thai with tofu',
  cuisine: 'thai',
  goalTags: ['high_protein'],
  nutrition: { ...catalogRecipe({ id: 'x', title: 'x' }).nutrition!, kcal: 520, proteinG: 36 },
});
const noodles = catalogRecipe({ id: 'r:noodles', title: 'Thai rice noodles', cuisine: 'thai' });

beforeEach(() => {
  useCookLogStore.getState().reset();
  usePreferencesStore.setState({
    prefs: { ...defaultPreferences, allergensAnswered: true, goals: ['more_protein'] },
  });
  jest.mocked(searchRecipes).mockImplementation(async (text) => {
    const items = /pad thai/i.test(text)
      ? [classic, lighter]
      : /noodle/i.test(text)
        ? [noodles, lighter]
        : [];
    return { items, nextCursor: null };
  });
  useSnapSession.setState({
    result: {
      id: 'dish-1',
      mode: 'dish',
      photoUri: 'file:///dish.jpg',
      takenAt: 0,
      remaining: 3,
      dish,
    },
  });
});

describe('SnapDishScreen', () => {
  it('shows the dish with an honestly labelled estimate', async () => {
    await renderScreen(<SnapDishScreen />);
    await screen.findByText('Closest recipes');
    expect(screen.getAllByText('Pad thai')[0]).toBeOnTheScreen();
    expect(screen.getByText('Likely match · Thai')).toBeOnTheScreen();
    expect(screen.getByText(/^about 900 kcal/)).toBeOnTheScreen();
    expect(screen.getByText('Fair estimate')).toBeOnTheScreen();
    expect(screen.getByText(/Estimated from a photo, not measured/)).toBeOnTheScreen();
  });

  it('suggests a healthier version and lists close recipes', async () => {
    await renderScreen(<SnapDishScreen />);
    expect(await screen.findByText('Healthier version to cook')).toBeOnTheScreen();
    expect(screen.getByText('Lighter pad thai with tofu')).toBeOnTheScreen();
    expect(screen.getByText(/About 380 fewer kcal/)).toBeOnTheScreen();
    expect(screen.getByText(/Fits your goals: more protein/)).toBeOnTheScreen();
    expect(screen.getByTestId('dish-match-r:classic')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'View recipe' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'r:lighter' },
    });
  });

  it('keeps recipes with a declared allergen out of every list', async () => {
    usePreferencesStore.setState({
      prefs: { ...defaultPreferences, allergensAnswered: true, allergens: ['peanut'] },
    });
    await renderScreen(<SnapDishScreen />);
    await screen.findByText('Healthier version to cook');
    expect(screen.queryByTestId('dish-match-r:classic')).toBeNull();
    expect(jest.mocked(searchRecipes).mock.calls[0]?.[1]).toMatchObject({
      avoidAllergens: ['peanut'],
    });
  });

  it('logs the meal to today as an estimate, once', async () => {
    await renderScreen(<SnapDishScreen />);
    await screen.findByText('Closest recipes');
    await userEvent.setup().press(screen.getByRole('button', { name: 'Log it to today' }));
    const entries = Object.values(useCookLogStore.getState().entries);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ recipeId: 'snap:pad-thai' });
    expect(entries[0]?.notes).toMatch(/^Eaten out, estimated from a photo: Pad thai/);
    expect(screen.getByRole('button', { name: 'Logged' })).toBeDisabled();
    expect(screen.getByTestId('dish-logged')).toBeOnTheScreen();
  });

  it('asks for allergy answers before showing recipes', async () => {
    usePreferencesStore.setState({ prefs: defaultPreferences });
    await renderScreen(<SnapDishScreen />);
    expect(screen.getByText('Tell us what to avoid first')).toBeOnTheScreen();
    expect(searchRecipes).not.toHaveBeenCalled();
  });

  it('retakes by clearing the result and going back to the camera', async () => {
    await renderScreen(<SnapDishScreen />);
    await screen.findByText('Closest recipes');
    await userEvent.setup().press(screen.getByRole('button', { name: 'Retake' }));
    expect(useSnapSession.getState().result).toBeNull();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('explains when there is no snap to show', async () => {
    useSnapSession.setState({ result: null });
    await renderScreen(<SnapDishScreen />);
    expect(screen.getByText('No dish photo yet')).toBeOnTheScreen();
  });
});
