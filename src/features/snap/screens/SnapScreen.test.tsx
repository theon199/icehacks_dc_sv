import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';
import type * as ReactModule from 'react';
import { Linking, type View as ViewType } from 'react-native';

import { useSessionStore } from '@/features/auth';
import type * as AiModule from '@/lib/api/ai';
import { aiApi } from '@/lib/api/ai';
import { ApiError } from '@/lib/api/errors';

import type * as TestingModule from '../testing';
import { SnapScreen } from './SnapScreen';
import { preparePhoto } from '../capture/preparePhoto';
import { useSnapSession } from '../snapSession';
import { mockRouter, renderScreen } from '../testing';

const mockTakePicture = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof ReactModule>('react');
  return {
    router: jest.requireActual<typeof TestingModule>('../testing').mockRouter,
    useIsFocused: () => true,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock('expo-camera', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  const { View } = jest.requireActual<{ View: typeof ViewType }>('react-native');
  function CameraView({
    ref,
    onCameraReady,
  }: {
    ref: ReactModule.Ref<unknown>;
    onCameraReady?: () => void;
  }) {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
    React.useEffect(() => onCameraReady?.(), [onCameraReady]);
    return React.createElement(View, { testID: 'mock-camera' });
  }
  return { CameraView, useCameraPermissions: jest.fn() };
});
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('../capture/preparePhoto', () => ({ preparePhoto: jest.fn() }));
jest.mock('@/lib/api/ai', () => ({
  ...jest.requireActual<typeof AiModule>('@/lib/api/ai'),
  aiApi: { readSnap: jest.fn() },
}));

const requestPermission = jest.fn();
const thisYear = new Date().getFullYear();

function signIn({ age, consent }: { age: number; consent: boolean }) {
  useSessionStore.getState().signedIn({
    userId: 'u1',
    birthYear: thisYear - age - 1,
    onboardingComplete: true,
    aiConsent: consent,
  });
}

function permission(state: 'granted' | 'ask' | 'blocked') {
  jest.mocked(useCameraPermissions).mockReturnValue([
    {
      granted: state === 'granted',
      canAskAgain: state !== 'blocked',
      status: state === 'granted' ? 'granted' : state === 'ask' ? 'undetermined' : 'denied',
      expires: 'never',
    } as never,
    requestPermission,
    jest.fn(),
  ]);
}

const quota = { remaining: 4, reset_at: '2026-11-12T00:00:00Z' };

beforeEach(() => {
  useSnapSession.getState().clear();
  signIn({ age: 30, consent: true });
  permission('granted');
  mockTakePicture.mockResolvedValue({ uri: 'file:///shot.jpg', width: 4032, height: 3024 });
  jest.mocked(preparePhoto).mockResolvedValue({
    uri: 'file:///small.jpg',
    base64: 'YWJj',
    width: 1280,
    height: 960,
  });
});

describe('Snap gating', () => {
  it('keeps the camera closed for people under 18', async () => {
    signIn({ age: 16, consent: true });
    await renderScreen(<SnapScreen />);
    expect(screen.getByText('Snap is for adults')).toBeOnTheScreen();
    expect(useCameraPermissions).not.toHaveBeenCalled();
  });

  it('asks adults to turn on AI before opening the camera', async () => {
    signIn({ age: 30, consent: false });
    await renderScreen(<SnapScreen />);
    expect(screen.getByText('Turn on AI to use Snap')).toBeOnTheScreen();
    expect(useCameraPermissions).not.toHaveBeenCalled();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Review and turn on' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/ai-consent');
  });
});

describe('Snap camera', () => {
  it('asks for camera access, and offers the library meanwhile', async () => {
    permission('ask');
    await renderScreen(<SnapScreen />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Allow camera' }));
    expect(requestPermission).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Choose from library' })).toBeOnTheScreen();
  });

  it('sends people to Settings when camera access is blocked', async () => {
    permission('blocked');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderScreen(<SnapScreen />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Open Settings' }));
    expect(openSettings).toHaveBeenCalled();
  });

  it('reads a pantry photo and opens the pantry result', async () => {
    jest.mocked(aiApi.readSnap).mockResolvedValue({
      status: 'ok',
      mode: 'pantry',
      items: [{ name: 'eggs', quantity: 6, unit: 'piece', confidence: 0.9 }],
      quota,
    });
    await renderScreen(<SnapScreen />);
    const shutter = screen.getByRole('button', { name: 'Take photo' });
    await waitFor(() => expect(shutter).toBeEnabled());
    await userEvent.setup().press(shutter);

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/snap/pantry'));
    expect(preparePhoto).toHaveBeenCalledWith({
      uri: 'file:///shot.jpg',
      width: 4032,
      height: 3024,
    });
    expect(jest.mocked(aiApi.readSnap).mock.calls[0]?.[0]).toEqual({
      mode: 'pantry',
      image: 'YWJj',
    });
    expect(useSnapSession.getState().result).toMatchObject({ mode: 'pantry', remaining: 4 });
  });

  it('reads a dish chosen from the library', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///lib.heic', width: 3000, height: 4000 } as never],
    });
    jest.mocked(aiApi.readSnap).mockImplementation(async () => ({
      status: 'ok',
      mode: 'dish',
      dish: {
        name: 'ramen',
        cuisine: null,
        key_ingredients: [],
        portion: 'one bowl',
        nutrition: {
          kcal: { estimate: 600, low: 500, high: 700 },
          protein_g: { estimate: 20, low: 15, high: 25 },
          carbs_g: { estimate: 80, low: 70, high: 90 },
          fat_g: { estimate: 20, low: 15, high: 25 },
          fiber_g: { estimate: 4, low: 3, high: 5 },
          sodium_mg: { estimate: 2000, low: 1600, high: 2400 },
        },
        nutrition_confidence: 'estimated',
        confidence: 0.8,
      },
      quota,
    }));
    await renderScreen(<SnapScreen />);
    const user = userEvent.setup();
    await user.press(screen.getByRole('tab', { name: 'Dish' }));
    await user.press(screen.getByRole('button', { name: 'Choose a photo from your library' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/snap/dish'));
    expect(jest.mocked(aiApi.readSnap).mock.calls[0]?.[0]).toMatchObject({ mode: 'dish' });
  });

  it('asks for another photo when no food is found', async () => {
    jest.mocked(aiApi.readSnap).mockResolvedValue({
      status: 'no_food',
      mode: 'pantry',
      reason: 'not_food',
      message: 'No food here',
      quota,
    });
    await renderScreen(<SnapScreen />);
    const shutter = screen.getByRole('button', { name: 'Take photo' });
    await waitFor(() => expect(shutter).toBeEnabled());
    await userEvent.setup().press(shutter);
    expect(await screen.findByText("We couldn't see any food")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Retake' }));
    expect(await screen.findByTestId('mock-camera')).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('explains the daily limit without offering a retry', async () => {
    jest.mocked(aiApi.readSnap).mockRejectedValue(
      new ApiError({
        kind: 'rate_limited',
        functionName: 'snap',
        status: 429,
        code: 'quota_exceeded',
        retryAfterSeconds: 3 * 3600,
      }),
    );
    await renderScreen(<SnapScreen />);
    const shutter = screen.getByRole('button', { name: 'Take photo' });
    await waitFor(() => expect(shutter).toBeEnabled());
    await userEvent.setup().press(shutter);
    expect(await screen.findByText("You've used today's snaps")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retake' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByTestId('mock-camera')).toBeOnTheScreen();
  });

  it('retries the same photo after a network failure', async () => {
    jest
      .mocked(aiApi.readSnap)
      .mockRejectedValueOnce(new ApiError({ kind: 'network', functionName: 'snap' }))
      .mockResolvedValueOnce({ status: 'ok', mode: 'pantry', items: [], quota });
    await renderScreen(<SnapScreen />);
    const shutter = screen.getByRole('button', { name: 'Take photo' });
    await waitFor(() => expect(shutter).toBeEnabled());
    await userEvent.setup().press(shutter);
    expect(await screen.findByText("You're offline")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/snap/pantry'));
    expect(preparePhoto).toHaveBeenCalledTimes(2);
  });

  it('cancels a snap in progress and goes back to the camera', async () => {
    let signal: AbortSignal | undefined;
    jest.mocked(aiApi.readSnap).mockImplementation(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          signal = options?.signal;
          signal?.addEventListener('abort', () =>
            reject(new ApiError({ kind: 'cancelled', functionName: 'snap' })),
          );
        }),
    );
    await renderScreen(<SnapScreen />);
    const shutter = screen.getByRole('button', { name: 'Take photo' });
    await waitFor(() => expect(shutter).toBeEnabled());
    await userEvent.setup().press(shutter);
    expect(await screen.findByText('Spotting the food items')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Cancel' }));
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByTestId('mock-camera')).toBeOnTheScreen();
    await act(async () => undefined);
    expect(useSnapSession.getState().result).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
