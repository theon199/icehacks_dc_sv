import { act, fireEvent, screen } from '@testing-library/react-native';

import type { RecipeDetail } from '@/lib/catalog';
import { renderWithTheme } from '@/test/render';

import { CookModeScreen } from './CookModeScreen';

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual<{ View: unknown }>('react-native');
  return { WebView: View };
});
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

type Listener = (event: unknown) => void;
const mockSpeechListeners = new Map<string, Listener>();
const mockSpeech = {
  isRecognitionAvailable: jest.fn(() => true),
  supportsOnDeviceRecognition: jest.fn(() => true),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  start: jest.fn(),
  abort: jest.fn(),
};
jest.mock('expo-speech-recognition', () => ({
  get ExpoSpeechRecognitionModule() {
    return mockSpeech;
  },
  useSpeechRecognitionEvent: (name: string, listener: Listener) => {
    mockSpeechListeners.set(name, listener);
  },
}));

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
  mockRecipeResult = { data: mockRecipe, isSuccess: true };
  mockSpeechListeners.clear();
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

    await act(async () => fireEvent.press(screen.getByTestId('cook-finish')));
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/cook/[id]/done',
      params: { id: 'mealdb:1' },
    });
  });

  it('moves between steps by voice', async () => {
    await renderWithTheme(<CookModeScreen recipeId="mealdb:1" />);
    await act(async () => fireEvent.press(screen.getByTestId('cook-voice-toggle')));

    expect(mockSpeech.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: true, lang: 'en-US' }),
    );

    await act(async () => mockSpeechListeners.get('start')?.(null));
    expect(screen.getByTestId('cook-voice-banner')).toBeTruthy();

    await act(async () =>
      mockSpeechListeners.get('result')?.({
        isFinal: false,
        results: [{ transcript: 'next step', confidence: 0.9, segments: [] }],
      }),
    );
    expect(screen.getByText('Simmer for 20 minutes.')).toBeTruthy();

    await act(async () =>
      mockSpeechListeners.get('result')?.({
        isFinal: true,
        results: [{ transcript: 'next step', confidence: 0.9, segments: [] }],
      }),
    );
    // The final result repeats the same words; it does not advance again.
    expect(screen.getByText('Simmer for 20 minutes.')).toBeTruthy();
  });

  it('explains when voice control is not allowed', async () => {
    mockSpeech.requestPermissionsAsync.mockResolvedValueOnce({ granted: false });
    await renderWithTheme(<CookModeScreen recipeId="mealdb:1" />);
    await act(async () => fireEvent.press(screen.getByTestId('cook-voice-toggle')));
    expect(
      screen.getByText('Voice control needs microphone and speech recognition access.'),
    ).toBeTruthy();
    expect(mockSpeech.start).not.toHaveBeenCalled();
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
