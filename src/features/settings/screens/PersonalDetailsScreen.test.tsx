import { screen, userEvent } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';

import { loadPersonalDetails, resetSettingsDepsForTests, updatePreferences } from '../deps';
import { PersonalDetailsScreen } from './PersonalDetailsScreen';

beforeEach(async () => {
  resetSettingsDepsForTests();
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: 1990,
    onboardingComplete: true,
  });
  await SecureStore.deleteItemAsync('famara.personal-details.user-1');
});

describe('PersonalDetailsScreen', () => {
  it('stores US entries in metric in the secure store', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PersonalDetailsScreen />);
    await user.type(await screen.findByTestId('personal-height-primary'), '5');
    await user.type(screen.getByTestId('personal-height-secondary'), '10');
    await user.type(screen.getByTestId('personal-weight'), '150');
    await user.press(screen.getByRole('radio', { name: 'Moderately active' }));
    await user.press(screen.getByTestId('personal-details-save'));

    expect(await loadPersonalDetails()).toEqual({
      heightCm: 177.8,
      weightKg: 68,
      sex: null,
      activity: 'moderate',
    });
  });

  it('shows saved details in metric when metric units are chosen', async () => {
    updatePreferences({ units: 'metric' });
    await SecureStore.setItemAsync(
      'famara.personal-details.user-1',
      JSON.stringify({ heightCm: 165, weightKg: 58.5, sex: 'female', activity: null }),
    );
    await renderWithTheme(<PersonalDetailsScreen />);
    expect(await screen.findByTestId('personal-height-primary')).toHaveDisplayValue('165');
    expect(screen.getByTestId('personal-weight')).toHaveDisplayValue('58.5');
    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked();
  });

  it('refuses an impossible value without saving', async () => {
    updatePreferences({ units: 'metric' });
    const user = userEvent.setup();
    await renderWithTheme(<PersonalDetailsScreen />);
    await user.type(await screen.findByTestId('personal-weight'), '4');
    await user.press(screen.getByTestId('personal-details-save'));

    expect(screen.getByText('Enter a weight between 20 and 400 kg.')).toBeOnTheScreen();
    expect(await SecureStore.getItemAsync('famara.personal-details.user-1')).toBeNull();
  });
});
