import { act, fireEvent, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import type { RecipeDetail } from '@/lib/catalog';
import { renderWithTheme } from '@/test/render';

import { CookModeScreen } from './CookModeScreen';
import { PARTIAL_SETTLE_MS } from '../logic/voiceCommands';

const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
  canGoBack: (): boolean => true,
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
// The player itself is native; the screen only needs something to mount in its place.
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationPriority: { HIGH: 'high' },
  IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
}));

/** A stand-in recognizer: the hook's event handlers by name, and what the device says it can do. */
const mockVoice = {
  handlers: {} as Record<string, ((event: unknown) => void) | undefined>,
  device: { canRecognize: true, onDevice: true },
  module: {
    isRecognitionAvailable: () => mockVoice.device.canRecognize,
    supportsOnDeviceRecognition: () => mockVoice.device.onDevice,
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
const hear = (name: string, event: unknown) => mockVoice.handlers[name]?.(event);

const mockRecipe: RecipeDetail = {
  id: 'mealdb:1',
  slug: 'lentil-soup',
  title: 'Lentil soup',
  summary: 'A warming soup.',
  cuisine: 'turkish',
  region: 'middle_east',
  course: 'soup',
  totalMinutes: 40,
  activeMinutes: 15,
  servings: 4,
  effort: 1,
  imageUrl: null,
  imageCredit: null,
  sourceName: 'Test',
  sourceUrl: null,
  license: 'test',
  nutritionConfidence: 'none',
  nutrition: null,
  allergens: {
    milk: 'free',
    egg: 'free',
    fish: 'free',
    shellfish: 'free',
    tree_nut: 'free',
    peanut: 'free',
    wheat: 'free',
    soy: 'free',
    sesame: 'free',
    gluten: 'free',
  },
  dietFlags: 3,
  goalTags: [],
  gentle: false,
  healthScore: 0.8,
  familyId: 'lentil-soup',
  ingredients: [
    {
      position: 0,
      ingredientId: 'lentil',
      text: '1 cup red lentils',
      quantity: 1,
      unit: 'cup',
      grams: 200,
      section: null,
      optional: false,
    },
  ],
  steps: [
    { position: 0, text: 'Rinse the lentils.', timerSeconds: null },
    { position: 1, text: 'Simmer for 20 minutes.', timerSeconds: 1200 },
    { position: 2, text: 'Blend and season.', timerSeconds: null },
  ],
  tutorials: [
    { kind: 'video', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'How to', publisher: null },
  ],
};

let mockRecipeResult: { data: RecipeDetail | null | undefined; isSuccess: boolean } = {
  data: mockRecipe,
  isSuccess: true,
};
jest.mock('@/lib/catalog', () => ({
  useRecipe: () => ({ ...mockRecipeResult, isError: false, error: null, refetch: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack = () => true;
  mockRecipeResult = { data: mockRecipe, isSuccess: true };
  mockVoice.handlers = {};
  mockVoice.device = { canRecognize: true, onDevice: true };
});

describe('CookModeScreen', () => {
  it('walks through the steps and finishes on the completion screen', async () => {
    await renderWithTheme(<CookModeScreen recipeId="mealdb:1" />);

    expect(screen.getByText('Rinse the lentils.')).toBeTruthy();
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByTestId('cook-next')));
    expect(screen.getByText('Simmer for 20 minutes.')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByTestId('cook-step-timer-start')));
    expect(screen.getByTestId('cook-step-timer')).toBeTruthy();
    expect(screen.getByLabelText('20:00 left')).toBeTruthy();

    // The running timer follows the cook to the next step in the tray.
    await act(async () => fireEvent.press(screen.getByTestId('cook-next')));
    expect(screen.getByText('Blend and season.')).toBeTruthy();
    expect(screen.getByTestId('cook-timer-tray')).toBeTruthy();

    // A timer is still going, so finishing asks first.
    const confirm = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await act(async () => fireEvent.press(screen.getByTestId('cook-finish')));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    const buttons: AlertButton[] = confirm.mock.calls[0]?.[2] ?? [];
    expect(confirm.mock.calls[0]?.[0]).toBe('Finish cooking?');
    await act(async () => buttons.find((button) => button.text === 'Finish')?.onPress?.());
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/cook/[id]/done',
      params: { id: 'mealdb:1' },
    });
    confirm.mockRestore();
  });

  it('finishes straight away when no timer is running', async () => {
    await renderWithTheme(<CookModeScreen recipeId="mealdb:1" />);
    await act(async () => fireEvent.press(screen.getByTestId('cook-next')));
    await act(async () => fireEvent.press(screen.getByTestId('cook-next')));
    await act(async () => fireEvent.press(screen.getByTestId('cook-finish')));
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/cook/[id]/done',
      params: { id: 'mealdb:1' },
    });
  });

  it('closes to home when cook mode was opened directly', async () => {
    mockRouter.canGoBack = () => false;
    await renderWithTheme(<CookModeScreen recipeId="mealdb:1" />);
    await act(async () => fireEvent.press(screen.getByLabelText('Leave cook mode')));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('lets the cook dismiss the voice permission notice', async () => {
    mockVoice.module.requestPermissionsAsync.mockResolvedValueOnce({ granted: false });
    await renderWithTheme(<CookModeScreen recipeId="mealdb:1" />);
    await act(async () => fireEvent.press(screen.getByTestId('cook-voice-toggle')));
    await act(async () => fireEvent.press(screen.getByTestId('cook-voice-banner-dismiss')));
    expect(screen.queryByTestId('cook-voice-banner')).toBeNull();
  });

  it('moves between steps by voice', async () => {
    await renderWithTheme(<CookModeScreen recipeId="mealdb:1" />);
    await act(async () => fireEvent.press(screen.getByTestId('cook-voice-toggle')));

    expect(mockVoice.module.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: true, lang: 'en-US' }),
    );

    await act(async () => hear('start', null));
    expect(screen.getByTestId('cook-voice-banner')).toBeTruthy();

    await act(async () =>
      hear('result', {
        isFinal: false,
        results: [{ transcript: 'next step', confidence: 0.9, segments: [] }],
      }),
    );
    // A partial result acts once it has stood for a moment with nothing added.
    expect(screen.queryByText('Simmer for 20 minutes.')).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, PARTIAL_SETTLE_MS + 50)));
    expect(screen.getByText('Simmer for 20 minutes.')).toBeTruthy();

    await act(async () =>
      hear('result', {
        isFinal: true,
        results: [{ transcript: 'next step', confidence: 0.9, segments: [] }],
      }),
    );
    // The final result repeats the same words; it does not advance again.
    expect(screen.getByText('Simmer for 20 minutes.')).toBeTruthy();
  });

  it('explains when voice control is not allowed', async () => {
    mockVoice.module.requestPermissionsAsync.mockResolvedValueOnce({ granted: false });
    await renderWithTheme(<CookModeScreen recipeId="mealdb:1" />);
    await act(async () => fireEvent.press(screen.getByTestId('cook-voice-toggle')));
    expect(
      screen.getByText('Voice control needs microphone and speech recognition access.'),
    ).toBeTruthy();
    expect(mockVoice.module.start).not.toHaveBeenCalled();
  });

  it('shows the tutorial video on request', async () => {
    await renderWithTheme(<CookModeScreen recipeId="mealdb:1" />);
    expect(screen.queryByTestId('cook-tutorial-video')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('cook-video-toggle')));
    expect(screen.getByTestId('cook-tutorial-video')).toBeTruthy();
  });

  it('ticks off ingredients in the drawer', async () => {
    await renderWithTheme(<CookModeScreen recipeId="mealdb:1" />);
    await act(async () => fireEvent.press(screen.getByTestId('cook-ingredients-open')));
    expect(screen.getByText('0 of 1 ready')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText('1 cup red lentils')));
    expect(screen.getByText('1 of 1 ready')).toBeTruthy();
  });

  it('says so when the recipe does not exist', async () => {
    mockRecipeResult = { data: null, isSuccess: true };
    await renderWithTheme(<CookModeScreen recipeId="nope" />);
    expect(screen.getByText('Recipe not found')).toBeTruthy();
  });
});
