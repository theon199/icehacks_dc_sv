import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Alert, type AlertButton } from 'react-native';

import { useSessionStore } from '@/features/auth';
import {
  emptyPersonalDetails,
  resetUserStores,
  usePersonalDetailsStore,
  useSettingsStore,
} from '@/stores';
import { renderWithTheme } from '@/test/render';

import { PersonalDetailsScreen } from './PersonalDetailsScreen';

/** Where the shared store keeps its Keychain copy. */
const KEYCHAIN_KEY = 'famara.user.personal_details';

const details = () => usePersonalDetailsStore.getState().details;

beforeEach(async () => {
  resetUserStores();
  await usePersonalDetailsStore.persist.rehydrate();
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: 1990,
    onboardingComplete: true,
  });
});

describe('PersonalDetailsScreen', () => {
  it('stores US entries in metric in the shared, Keychain-backed store', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<PersonalDetailsScreen />);
    await user.type(await screen.findByTestId('personal-height-primary'), '5');
    await user.type(screen.getByTestId('personal-height-secondary'), '10');
    await user.type(screen.getByTestId('personal-weight'), '150');
    await user.press(screen.getByRole('radio', { name: 'Moderately active' }));
    await user.press(screen.getByTestId('personal-details-save'));

    expect(details()).toEqual({ heightCm: 177.8, weightKg: 68, sex: null, activity: 'moderate' });
    await waitFor(async () =>
      expect(await SecureStore.getItemAsync(KEYCHAIN_KEY)).toContain('"heightCm":177.8'),
    );
  });

  it('shows what the shared store holds, including "prefer not to say"', async () => {
    usePersonalDetailsStore.getState().update({ heightCm: 182, sex: 'unspecified' });
    useSettingsStore.getState().setUnits('metric');

    await renderWithTheme(<PersonalDetailsScreen />);
    expect(await screen.findByTestId('personal-height-primary')).toHaveDisplayValue('182');
    expect(screen.getByRole('radio', { name: 'Prefer not to say' })).toBeChecked();
  });

  it('shows saved details in metric when metric units are chosen', async () => {
    useSettingsStore.getState().setUnits('metric');
    usePersonalDetailsStore.getState().update({ heightCm: 165, weightKg: 58.5, sex: 'female' });
    await renderWithTheme(<PersonalDetailsScreen />);
    expect(await screen.findByTestId('personal-height-primary')).toHaveDisplayValue('165');
    expect(screen.getByTestId('personal-weight')).toHaveDisplayValue('58.5');
    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked();
  });

  it('refuses an impossible value without saving', async () => {
    useSettingsStore.getState().setUnits('metric');
    const user = userEvent.setup();
    await renderWithTheme(<PersonalDetailsScreen />);
    await user.type(await screen.findByTestId('personal-weight'), '4');
    await user.press(screen.getByTestId('personal-details-save'));

    expect(screen.getByText('Enter a weight between 20 and 400 kg.')).toBeOnTheScreen();
    expect(details()).toEqual(emptyPersonalDetails);
  });

  it('asks before removing saved details', async () => {
    usePersonalDetailsStore.getState().update({ heightCm: 170, weightKg: 70 });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const user = userEvent.setup();
    await renderWithTheme(<PersonalDetailsScreen />);
    await user.press(await screen.findByTestId('personal-details-clear'));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(details().heightCm).toBe(170);

    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    await act(async () => buttons.find((button) => button.text === 'Remove')?.onPress?.());
    expect(details()).toEqual(emptyPersonalDetails);
    alert.mockRestore();
  });
});
