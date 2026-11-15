import { fireEvent, screen } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import type * as ReactModule from 'react';
import type { View as ViewType } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';

import { CoachSetupScreen } from './CoachSetupScreen';

const mockRouter = { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-camera', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  const { View } = jest.requireActual<{ View: typeof ViewType }>('react-native');
  return {
    CameraView: () => React.createElement(View, { testID: 'mock-camera' }),
    useCameraPermissions: jest.fn(),
  };
});

const thisYear = new Date().getFullYear();

function signIn(consent: boolean) {
  useSessionStore.getState().signedIn({
    userId: 'u1',
    birthYear: thisYear - 30,
    onboardingComplete: true,
    aiConsent: consent,
  });
}

function grantCamera() {
  jest
    .mocked(useCameraPermissions)
    .mockReturnValue([
      { granted: true, canAskAgain: true, status: 'granted', expires: 'never' } as never,
      jest.fn(),
      jest.fn(),
    ]);
}

function renderSetup() {
  return renderWithTheme(<CoachSetupScreen recipeId="mealdb:52865" />);
}

async function toViewCheck() {
  for (let i = 0; i < 4; i += 1) await fireEvent.press(screen.getByTestId('setup-next'));
}

describe('CoachSetupScreen', () => {
  beforeEach(() => grantCamera());

  it('walks the four mounting steps to the view check', async () => {
    signIn(true);
    await renderSetup();
    expect(screen.getByText('Open the cabinet above your counter')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('setup-next'));
    expect(screen.getByText('Lay your phone on the bottom shelf')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('setup-next'));
    await fireEvent.press(screen.getByTestId('setup-next'));
    expect(screen.getByText('Check my view')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('setup-next'));
    expect(screen.getByTestId('setup-view-check')).toBeOnTheScreen();
    expect(screen.getByTestId('mock-camera')).toBeOnTheScreen();
  });

  it('starts the coach for people who may use AI', async () => {
    signIn(true);
    await renderSetup();
    await toViewCheck();
    await fireEvent.press(screen.getByTestId('setup-start'));
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/cook/[id]/coach',
      params: { id: 'mealdb:52865' },
    });
  });

  it('falls back to cook mode without AI consent and says why', async () => {
    signIn(false);
    await renderSetup();
    await toViewCheck();
    expect(screen.getByText(/The coach needs AI turned on/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('setup-start'));
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/cook/[id]',
      params: { id: 'mealdb:52865' },
    });
  });

  it('goes back a step, and closes from the first step', async () => {
    signIn(true);
    await renderSetup();
    await fireEvent.press(screen.getByTestId('setup-next'));
    await fireEvent.press(screen.getByTestId('setup-back'));
    expect(screen.getByText('Open the cabinet above your counter')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('setup-back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
