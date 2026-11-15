import { act, fireEvent, screen } from '@testing-library/react-native';
import Storage from 'expo-sqlite/kv-store';
import type * as ReactModule from 'react';

import type { CoachRequest, CoachResponse } from '@/lib/api/ai';
import type { RecipeDetail } from '@/lib/catalog';
import { renderWithTheme } from '@/test/render';

import { CoachScreen } from './CoachScreen';
import type { CoachQuestionDeps } from './hooks/useCoachQuestion';

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { HIGH: 4 },
  IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
}));

const mockTakePicture = jest.fn(async () => ({
  uri: 'file://frame.jpg',
  width: 3024,
  height: 4032,
}));
jest.mock('expo-camera', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  const { View } = jest.requireActual<{ View: ReactModule.ElementType }>('react-native');
  function CameraView({
    ref,
    onCameraReady,
  }: {
    ref?: ReactModule.Ref<unknown>;
    onCameraReady?: () => void;
  }) {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
    React.useEffect(() => onCameraReady?.(), [onCameraReady]);
    return React.createElement(View, { testID: 'camera-preview' });
  }
  const permission = { granted: true, canAskAgain: true, status: 'granted' };
  return {
    CameraView,
    useCameraPermissions: () => [permission, jest.fn(), jest.fn(async () => permission)],
  };
});
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: jest.fn(),
      release: jest.fn(),
      renderAsync: async () => ({
        release: jest.fn(),
        saveAsync: async () => ({
          uri: 'file://still.jpg',
          base64: 'STILL',
          width: 768,
          height: 1024,
        }),
      }),
    }),
  },
}));

const mockVoice = {
  handlers: {} as Record<string, ((event: unknown) => void) | undefined>,
  module: {
    isRecognitionAvailable: () => true,
    supportsOnDeviceRecognition: () => true,
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    start: jest.fn(),
    abort: jest.fn(),
  },
};
jest.mock('expo-speech-recognition', () => ({
  get ExpoSpeechRecognitionModule() {
    return mockVoice.module;
  },
  useSpeechRecognitionEvent: (name: string, handler: (event: unknown) => void) => {
    mockVoice.handlers[name] = handler;
  },
}));

const mockRecipe = {
  id: 'mealdb:52865',
  title: 'Matar Paneer',
  steps: [
    { position: 0, text: 'Fry the onion until soft', timerSeconds: null },
    { position: 1, text: 'Add the peas and simmer for 2 minutes', timerSeconds: 120 },
    { position: 2, text: 'Stir in the paneer and garam masala', timerSeconds: null },
  ],
} as unknown as RecipeDetail;
jest.mock('@/lib/catalog', () => ({
  useRecipe: () => ({
    data: mockRecipe,
    isSuccess: true,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('../hooks/useFlushPendingCooks', () => ({ useFlushPendingCooks: jest.fn() }));

const NOT_YET: CoachResponse = {
  verdict: 'not_yet',
  answer: "Some garam masala on the left hasn't mixed in. A few more stirs.",
  focus: { x: 0.8, y: 0.4, r: 0.12 },
  quota: { remaining: 59, reset_at: '2026-11-15T00:00:00Z' },
};

async function hear(text: string) {
  await act(async () =>
    mockVoice.handlers.result?.({ isFinal: true, results: [{ transcript: text, confidence: 1 }] }),
  );
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  mockVoice.handlers = {};
  Storage.clearSync();
});

describe('CoachScreen', () => {
  it("starts the step's own timer by tap when the coach cannot hear", async () => {
    const deps: CoachQuestionDeps = {
      askCoach: jest.fn<Promise<CoachResponse>, [CoachRequest, unknown]>(async () => NOT_YET),
      isOnline: () => true,
      profile: () => ({ diets: [], allergens: [] }),
    };
    await renderWithTheme(<CoachScreen recipeId="mealdb:52865" deps={deps} />);
    await act(async () => fireEvent.press(screen.getByTestId('coach-next')));
    await act(async () => fireEvent.press(screen.getByTestId('coach-start-step-timer')));
    expect(screen.getByLabelText('Step 2, 2:00 left')).toBeTruthy();
    expect(screen.queryByTestId('coach-timer-hint')).toBeNull();
  });

  it('sets a timer by voice, then answers a question with a photo: "Not yet"', async () => {
    const askCoach = jest.fn<Promise<CoachResponse>, [CoachRequest, unknown]>(async () => NOT_YET);
    const deps: CoachQuestionDeps = {
      askCoach,
      isOnline: () => true,
      profile: () => ({ diets: ['vegetarian'], allergens: [] }),
    };
    await renderWithTheme(<CoachScreen recipeId="mealdb:52865" deps={deps} />);
    await act(async () => mockVoice.handlers.start?.(null));

    expect(screen.getByLabelText('Step 1 of 3. Fry the onion until soft')).toBeTruthy();
    expect(screen.getByTestId('coach-live-tile')).toBeTruthy();
    expect(screen.getByTestId('coach-status-ready')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByTestId('coach-next')));
    expect(screen.getByText('Add the peas and simmer for 2 minutes')).toBeTruthy();
    expect(screen.getByText('This step has a 2 minute timer. Say "set a timer".')).toBeTruthy();

    await hear('Hey Famara, set a 2 minute timer for the peas.');
    expect(screen.getByText('Peas, 2 minutes. Timer set.')).toBeTruthy();
    expect(screen.getByLabelText('Peas, 2:00 left')).toBeTruthy();
    expect(screen.queryByTestId('coach-timer-hint')).toBeNull();

    await hear('next');
    await hear('Hey Famara, is this stirred enough?');

    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    expect(askCoach).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Is this stirred enough?',
        image: 'STILL',
        recipe: expect.objectContaining({ step: 'Stir in the paneer and garam masala' }),
      }),
      expect.anything(),
    );
    expect(screen.getByText('Not yet')).toBeTruthy();
    expect(screen.getByText(NOT_YET.answer)).toBeTruthy();
    expect(screen.getByTestId('coach-focus-ring')).toBeTruthy();
    expect(screen.getByTestId('coach-check-again')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByTestId('coach-check-again')));
    await act(async () => {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(askCoach).toHaveBeenCalledTimes(2);
  });

  it('finishes on the last step and opens the review', async () => {
    const deps: CoachQuestionDeps = {
      askCoach: jest.fn(),
      isOnline: () => true,
      profile: () => ({ diets: [], allergens: [] }),
    };
    await renderWithTheme(<CoachScreen recipeId="mealdb:52865" deps={deps} />);
    await hear('next');
    await hear('next');
    await act(async () => fireEvent.press(screen.getByTestId('coach-finish')));
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/cook/[id]/done',
      params: { id: 'mealdb:52865' },
    });
  });
});
