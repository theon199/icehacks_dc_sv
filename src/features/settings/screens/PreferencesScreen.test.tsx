import { screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';

import { MAX_LOVED_CUISINES, resetSettingsDepsForTests, updatePreferences } from '../deps';
import { PreferencesScreen } from './PreferencesScreen';

beforeEach(() => {
  resetSettingsDepsForTests();
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: 1990,
    onboardingComplete: true,
  });
});

type AlertButtons = Parameters<typeof Alert.alert>[2];

describe('PreferencesScreen', () => {
  it('adds an allergen straight away', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    await user.press(screen.getByRole('checkbox', { name: 'Peanuts' }));
    expect(screen.getByRole('checkbox', { name: 'Peanuts' })).toBeChecked();
  });

  it('asks before removing a declared allergen and keeps it on cancel', async () => {
    updatePreferences({ allergens: ['peanut'] });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    await user.press(screen.getByRole('checkbox', { name: 'Peanuts' }));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: 'Peanuts' })).toBeChecked();
  });

  it('removes the allergen once confirmed', async () => {
    updatePreferences({ allergens: ['peanut'] });
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons: AlertButtons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    await user.press(screen.getByRole('checkbox', { name: 'Peanuts' }));
    expect(screen.getByRole('checkbox', { name: 'Peanuts' })).not.toBeChecked();
  });

  it('stops offering cuisines once five are chosen', async () => {
    updatePreferences({ cuisines: ['indian', 'thai', 'mexican', 'italian', 'nigerian'] });
    await renderWithTheme(<PreferencesScreen />);
    expect(screen.getByText(`5 of ${MAX_LOVED_CUISINES} chosen`)).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Korean' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Thai' })).toBeEnabled();
  });

  it('saves the time budget and household size', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PreferencesScreen />);
    await user.press(screen.getByRole('radio', { name: '30 min' }));
    await user.press(screen.getByRole('button', { name: 'More people' }));

    expect(screen.getByRole('radio', { name: '30 min' })).toBeChecked();
    expect(screen.getByTestId('household-value')).toHaveTextContent('3 people');
  });
});
