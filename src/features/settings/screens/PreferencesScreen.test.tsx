import { act, screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useSessionStore } from '@/features/auth';
import {
  MAX_CUISINES,
  resetUserStores,
  selectAvoidAllergens,
  selectDietMask,
  selectHasAnsweredAllergens,
  usePreferencesStore,
  type Preferences,
} from '@/stores';
import { renderWithTheme } from '@/test/render';

import { PreferencesScreen } from './PreferencesScreen';

const updatePreferences = (patch: Partial<Preferences>) =>
  usePreferencesStore.getState().update(patch);
const setAllergens = (allergens: Preferences['allergens']) =>
  usePreferencesStore.getState().setAllergens(allergens);

beforeEach(() => {
  resetUserStores();
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: 1990,
    onboardingComplete: true,
  });
});

type AlertButtons = Parameters<typeof Alert.alert>[2];

describe('PreferencesScreen', () => {
  it('adds an allergen to the store the safety filter reads, straight away', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    await user.press(screen.getByRole('checkbox', { name: 'Peanuts' }));
    expect(screen.getByRole('checkbox', { name: 'Peanuts' })).toBeChecked();
    expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual(['peanut']);
    expect(selectHasAnsweredAllergens(usePreferencesStore.getState())).toBe(true);
  });

  it('saves diets to the shared store', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    await user.press(screen.getByRole('checkbox', { name: 'Vegan' }));
    expect(usePreferencesStore.getState().prefs.diets).toEqual(['vegan']);
    expect(selectDietMask(usePreferencesStore.getState())).not.toBe(0);
  });

  it('stores goals in the synced vocabulary', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    await user.press(screen.getByRole('checkbox', { name: 'Steadier energy' }));
    expect(usePreferencesStore.getState().prefs.goals).toEqual(['steadier_energy']);
    expect(screen.getByRole('checkbox', { name: 'Steadier energy' })).toBeChecked();
  });

  it('asks before removing a declared allergen and keeps it on cancel', async () => {
    setAllergens(['peanut']);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    await user.press(screen.getByRole('checkbox', { name: 'Peanuts' }));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: 'Peanuts' })).toBeChecked();
  });

  it('removes the allergen once confirmed', async () => {
    setAllergens(['peanut']);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons: AlertButtons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    await user.press(screen.getByRole('checkbox', { name: 'Peanuts' }));
    expect(screen.getByRole('checkbox', { name: 'Peanuts' })).not.toBeChecked();
    expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual([]);
    expect(selectHasAnsweredAllergens(usePreferencesStore.getState())).toBe(true);
  });

  it('stops offering cuisines once five are chosen', async () => {
    updatePreferences({ cuisines: ['indian', 'thai', 'mexican', 'italian', 'nigerian'] });
    await renderWithTheme(<PreferencesScreen />);
    expect(screen.getByText(`5 of ${MAX_CUISINES} chosen`)).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Korean' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Thai' })).toBeEnabled();
  });

  it('saves the time budget and household size', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    await user.press(screen.getByRole('radio', { name: '30 min' }));
    await user.press(screen.getByRole('button', { name: 'More people' }));

    expect(screen.getByRole('radio', { name: '30 min' })).toBeChecked();
    expect(screen.getByTestId('household-value')).toHaveTextContent('2 people');
    expect(usePreferencesStore.getState().prefs).toMatchObject({
      maxMinutes: 30,
      householdSize: 2,
    });
  });

  it('applies a confirmed removal to the allergens saved while the dialog was open', async () => {
    setAllergens(['peanut']);
    let confirm: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons: AlertButtons) => {
      confirm = buttons?.find((button) => button.style === 'destructive')?.onPress;
    });
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    await user.press(screen.getByRole('checkbox', { name: 'Peanuts' }));
    await act(async () => setAllergens(['peanut', 'sesame']));
    await act(async () => confirm?.());

    expect(screen.getByRole('checkbox', { name: 'Peanuts' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sesame' })).toBeChecked();
  });

  it('tells "not answered" apart from "no allergies"', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    expect(screen.getByText(/^Not answered yet/)).toBeOnTheScreen();
    await user.press(screen.getByTestId('prefs-allergen-none'));
    expect(screen.getByText(/^None declared/)).toBeOnTheScreen();
    expect(screen.queryByTestId('prefs-allergen-none')).not.toBeOnTheScreen();
    expect(selectHasAnsweredAllergens(usePreferencesStore.getState())).toBe(true);
  });
});
