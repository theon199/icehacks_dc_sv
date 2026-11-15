import type * as FlashListModule from '@shopify/flash-list';
import { onlineManager } from '@tanstack/react-query';
import { act, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type * as ReactModule from 'react';
import type { View as ViewType } from 'react-native';

import { useSessionStore } from '@/features/auth';
import type * as AiModule from '@/lib/api/ai';
import { aiApi } from '@/lib/api/ai';
import { ApiError } from '@/lib/api/errors';

import type * as TestingModule from '../testing';
import { SnapScreen } from './SnapScreen';
import { preparePhoto } from '../capture/preparePhoto';
import { SWEEP_FRAME_INTERVAL_MS } from '../logic/sweep';
import { useSnapSession } from '../snapSession';
import { blurScreen, mockRouter, renderScreen } from '../testing';

const mockTakePicture = jest.fn();
type Listener = (event: never) => void;
/** Recognition event handlers the screen registered, so tests can play speech events. */
const mockSpeech = new Map<string, Listener>();

jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual<typeof TestingModule>('../testing').MockFlashList,
  useRecyclingState:
    jest.requireActual<typeof FlashListModule>('@shopify/flash-list').useRecyclingState,
}));
jest.mock('expo-router', () => {
  const helpers = jest.requireActual<typeof TestingModule>('../testing');
  return {
    router: helpers.mockRouter,
    useRouter: () => helpers.mockRouter,
    useIsFocused: helpers.useTestIsFocused,
    useFocusEffect: helpers.useTestFocusEffect,
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
jest.mock('expo-crypto', () => ({ randomUUID: () => '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b' }));
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: jest.fn(() => true),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    supportsOnDeviceRecognition: jest.fn(() => true),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
  useSpeechRecognitionEvent: (name: string, handler: Listener) => {
    mockSpeech.set(name, handler);
  },
}));
jest.mock('../capture/preparePhoto', () => ({ preparePhoto: jest.fn() }));
jest.mock('@/lib/api/ai', () => ({
  ...jest.requireActual<typeof AiModule>('@/lib/api/ai'),
  aiApi: { readSnap: jest.fn() },
}));

// Each test films through several timed stills; under a busy machine 5 s is too tight.
jest.setTimeout(20_000);

const SWEEP_ID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
const quota = (remaining: number) => ({ remaining, reset_at: '2026-11-15T00:00:00Z' });

const found = (names: string[], remaining = 3): AiModule.SnapResponse => ({
  status: 'ok',
  mode: 'pantry',
  items: names.map((name) => ({ name, quantity: null, unit: null, confidence: 0.9 })),
  quota: quota(remaining),
});

async function emitSpeech(name: string, event: unknown = {}) {
  await act(async () => mockSpeech.get(name)?.(event as never));
}

async function frames(count: number) {
  await act(() => jest.advanceTimersByTimeAsync(SWEEP_FRAME_INTERVAL_MS * count));
}

const thisYear = new Date().getFullYear();
let shot = 0;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-14T12:00:00Z') });
  mockSpeech.clear();
  useSnapSession.getState().clear();
  useSessionStore.getState().signedIn({
    userId: 'u1',
    birthYear: thisYear - 31,
    onboardingComplete: true,
    aiConsent: true,
  });
  jest
    .mocked(useCameraPermissions)
    .mockReturnValue([
      { granted: true, canAskAgain: true, status: 'granted', expires: 'never' } as never,
      jest.fn(),
      jest.fn(),
    ]);
  shot = 0;
  mockTakePicture.mockImplementation(async () => {
    shot += 1;
    return { uri: `file:///still-${shot}.jpg`, width: 4032, height: 3024 };
  });
  jest.mocked(preparePhoto).mockImplementation(async (source) => ({
    uri: source.uri,
    base64: `b64-${source.uri.slice(-5, -4)}`,
    width: 1280,
    height: 960,
  }));
});

afterEach(() => jest.useRealTimers());

async function startFilming() {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await renderScreen(<SnapScreen />);
  const shutter = screen.getByRole('button', { name: 'Start filming' });
  await waitFor(() => expect(shutter).toBeEnabled());
  await user.press(shutter);
  return user;
}

describe('Fridge sweep', () => {
  /** The AI: words find paneer, the first batch milk and eggs, later batches eggs and feta. */
  function answerSweep() {
    jest.mocked(aiApi.readSnap).mockImplementation(async (input: AiModule.SnapInput) => {
      if ('text' in input) return found(['paneer']);
      if ('images' in input && input.images[0] === 'b64-1') return found(['milk', 'eggs'], 17);
      return found(['eggs', 'feta']);
    });
  }

  it('films in batches and lists each item once, tagging new finds for a moment', async () => {
    answerSweep();
    await startFilming();

    const sheet = await screen.findByTestId('sweep-sheet');
    expect(within(sheet).getByText('Filming')).toBeOnTheScreen();
    expect(screen.getByTestId('sweep-chip')).toHaveTextContent('0:00');

    // Three stills make the first batch.
    await frames(3);
    expect(screen.getByTestId('sweep-title')).toHaveTextContent('Seeing 2 items');
    expect(within(screen.getByTestId('sweep-item-milk')).getByText('New')).toBeOnTheScreen();
    expect(mockTakePicture).toHaveBeenCalledWith({
      quality: 0.7,
      exif: false,
      shutterSound: false,
    });

    // The second batch repeats the eggs: they stay listed once.
    await frames(3);
    expect(screen.getByTestId('sweep-title')).toHaveTextContent('Seeing 3 items');
    const calls = jest.mocked(aiApi.readSnap).mock.calls.map(([input]) => input);
    expect(calls).toEqual([
      { mode: 'pantry', sweep_id: SWEEP_ID, images: ['b64-1', 'b64-2', 'b64-3'] },
      { mode: 'pantry', sweep_id: SWEEP_ID, images: ['b64-4', 'b64-5', 'b64-6'] },
    ]);
    // The "New" tag comes off after a moment.
    await act(() => jest.advanceTimersByTimeAsync(3000));
    expect(within(screen.getByTestId('sweep-item-milk')).queryByText('New')).toBeNull();
  });

  it('adds what was said, then opens the review with the whole list', async () => {
    answerSweep();
    const user = await startFilming();
    await frames(3);

    // The mic stops filming and shows what it hears.
    await user.press(screen.getByRole('button', { name: 'Say what it missed' }));
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: true, continuous: false }),
    );
    await emitSpeech('start');
    expect(screen.getByTestId('sweep-chip')).toHaveTextContent('Paused');
    await emitSpeech('result', {
      isFinal: false,
      results: [{ transcript: 'paneer in the freezer', confidence: 1, segments: [] }],
    });
    expect(screen.getByTestId('sweep-transcript')).toHaveTextContent(/paneer in the freezer/);
    expect(screen.getByRole('button', { name: 'Film more' })).toBeOnTheScreen();

    await emitSpeech('end');
    await act(() => jest.advanceTimersByTimeAsync(0));
    expect(jest.mocked(aiApi.readSnap)).toHaveBeenLastCalledWith(
      { mode: 'pantry', sweep_id: SWEEP_ID, text: 'paneer in the freezer' },
      expect.anything(),
    );
    expect(within(screen.getByTestId('sweep-item-paneer')).getByText('You said')).toBeOnTheScreen();
    // Stopping for the mic sent the still taken since the first batch, which found feta.
    expect(screen.getByTestId('sweep-title')).toHaveTextContent('3 from video');

    await user.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/snap/pantry'));
    const result = useSnapSession.getState().result;
    expect(result).toMatchObject({ mode: 'sweep', id: SWEEP_ID, remaining: 17 });
    expect(result?.mode === 'sweep' ? result.items.map((item) => item.name) : []).toEqual([
      'Paneer',
      'Feta',
      'Milk',
      'Eggs',
    ]);
  });

  it('turns the mic off when the tab loses focus while it is listening', async () => {
    answerSweep();
    const user = await startFilming();
    await frames(3);
    await user.press(screen.getByRole('button', { name: 'Say what it missed' }));
    await emitSpeech('start');
    // The mic already paused filming, so only the mic is left running.
    expect(screen.getByTestId('sweep-chip')).toHaveTextContent('Paused');
    jest.mocked(ExpoSpeechRecognitionModule.stop).mockClear();

    await act(async () => blurScreen());
    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);
  });

  it('never starts the mic when the tab loses focus while permission is being asked', async () => {
    answerSweep();
    let grant: (value: { granted: boolean }) => void = () => {};
    jest
      .mocked(ExpoSpeechRecognitionModule.requestPermissionsAsync)
      .mockImplementationOnce(() => new Promise((resolve) => (grant = resolve)) as never);
    const user = await startFilming();
    await frames(3);
    jest.mocked(ExpoSpeechRecognitionModule.start).mockClear();
    await user.press(screen.getByRole('button', { name: 'Say what it missed' }));

    await act(async () => blurScreen());
    await act(async () => grant({ granted: true }));
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
  });

  it('stops by itself after twelve stills', async () => {
    jest.mocked(aiApi.readSnap).mockResolvedValue(found(['milk']));
    await startFilming();
    await frames(14);
    expect(mockTakePicture).toHaveBeenCalledTimes(12);
    expect(aiApi.readSnap).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId('sweep-chip')).toHaveTextContent('Paused');
    expect(screen.getByRole('button', { name: 'Film more' })).toBeDisabled();
  });

  it('keeps what was found when one batch fails', async () => {
    jest
      .mocked(aiApi.readSnap)
      .mockResolvedValueOnce(found(['milk']))
      .mockRejectedValueOnce(new ApiError({ kind: 'network', functionName: 'snap' }));
    await startFilming();
    await frames(6);
    expect(screen.getByTestId('sweep-notice')).toHaveTextContent(/Some frames couldn't be read/);
    expect(screen.getByTestId('sweep-item-milk')).toBeOnTheScreen();
  });

  it('says so when the frames show no food', async () => {
    jest.mocked(aiApi.readSnap).mockResolvedValue({
      status: 'no_food',
      mode: 'pantry',
      reason: 'not_food',
      message: 'No food',
      quota: quota(3),
    });
    await startFilming();
    await frames(3);
    expect(screen.getByTestId('sweep-status')).toHaveTextContent(/No food seen yet/);
  });

  it('ends the pass at the daily limit and keeps the shutter off', async () => {
    jest.mocked(aiApi.readSnap).mockRejectedValue(
      new ApiError({
        kind: 'rate_limited',
        functionName: 'snap',
        status: 429,
        code: 'quota_exceeded',
        retryAfterSeconds: 3600,
      }),
    );
    const user = await startFilming();
    await frames(3);
    expect(await screen.findByText("You've reached today's Snap limit")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('button', { name: 'Start filming' })).toBeDisabled();
    expect(screen.getByTestId('snap-hint')).toHaveTextContent(/Daily limit reached/);
  });

  it('explains when the microphone is off, and the field still works', async () => {
    jest.mocked(ExpoSpeechRecognitionModule.requestPermissionsAsync).mockResolvedValueOnce({
      granted: false,
    } as never);
    jest.mocked(aiApi.readSnap).mockResolvedValue(found(['lemon']));
    const user = await startFilming();
    await user.press(screen.getByRole('button', { name: 'Say what it missed' }));
    expect(screen.getByTestId('sweep-words-note')).toHaveTextContent(/microphone is off/);
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Add something it missed'), 'two lemons', {
      submitEditing: true,
    });
    await act(() => jest.advanceTimersByTimeAsync(0));
    expect(jest.mocked(aiApi.readSnap)).toHaveBeenLastCalledWith(
      { mode: 'pantry', sweep_id: SWEEP_ID, text: 'two lemons' },
      expect.anything(),
    );
  });

  it('does not start filming offline, and tries again once asked', async () => {
    onlineManager.setOnline(false);
    try {
      const user = await startFilming();
      expect(await screen.findByText("You're offline")).toBeOnTheScreen();
      expect(mockTakePicture).not.toHaveBeenCalled();
      onlineManager.setOnline(true);
      jest.mocked(aiApi.readSnap).mockResolvedValue(found(['milk']));
      await user.press(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByTestId('sweep-sheet')).toBeOnTheScreen();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('discards the pass from the close circle', async () => {
    jest.mocked(aiApi.readSnap).mockResolvedValue(found(['milk']));
    const user = await startFilming();
    await frames(1);
    await user.press(screen.getByRole('button', { name: 'Discard this sweep' }));
    expect(screen.queryByTestId('sweep-sheet')).toBeNull();
    await frames(6);
    expect(aiApi.readSnap).not.toHaveBeenCalled();
    expect(useSnapSession.getState().result).toBeNull();
  });
});
