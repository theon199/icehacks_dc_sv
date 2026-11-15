import { fireEvent, screen, userEvent } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import type { RecipeImportResponse } from '@/lib/api/ai';
import { ApiError } from '@/lib/api/errors';
import { renderWithTheme } from '@/test/render';

import { AddRecipeScreen } from './AddRecipeScreen';
import type { RecipeImportDeps } from '../hooks/useRecipeImport';
import { useImportSession } from '../importSession';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-speech-recognition', () => ({ ExpoSpeechRecognitionModule: {} }));

const QUOTA = { remaining: 19, reset_at: '2026-11-15T00:00:00.000Z' };
const OK: RecipeImportResponse = {
  status: 'ok',
  quota: QUOTA,
  recipe: {
    title: 'Garlic fried rice',
    servings: 2,
    total_minutes: 15,
    cuisine: 'Filipino',
    meal: 'breakfast',
    ingredients: [{ text: '4 cups cooked rice', name: 'cooked rice' }],
    steps: ['Fry the garlic, then the rice.'],
    source_url: null,
  },
};

const thisYear = new Date().getFullYear();
const initialSession = useSessionStore.getState();

function deps(importRecipe: RecipeImportDeps['importRecipe']): RecipeImportDeps {
  return {
    importRecipe,
    prepare: () => Promise.reject(new Error('no photos in this test')),
    now: () => Date.parse('2026-11-14T10:00:00.000Z'),
  };
}

beforeEach(() => {
  useSessionStore.setState(initialSession, true);
  useSessionStore.getState().signedIn({
    userId: 'person-1',
    birthYear: thisYear - 35,
    onboardingComplete: true,
    aiConsent: true,
  });
  useImportSession.getState().clear();
  mockRouter.push.mockReset();
});

async function typeRecipe(importRecipe: RecipeImportDeps['importRecipe']) {
  const user = userEvent.setup();
  await renderWithTheme(<AddRecipeScreen importDeps={deps(importRecipe)} />);
  await user.press(screen.getByTestId('method-type'));
  await fireEvent.changeText(
    screen.getByTestId('recipe-text'),
    'Garlic fried rice: rice, garlic. Fry.',
  );
  await user.press(screen.getByTestId('recipe-text-submit'));
  return user;
}

describe('AddRecipeScreen', () => {
  it('reads typed words and opens Review with the recipe', async () => {
    const importRecipe = jest.fn(() => Promise.resolve(OK));
    await typeRecipe(importRecipe);
    expect(importRecipe).toHaveBeenCalledWith(
      { source: 'text', text: 'Garlic fried rice: rice, garlic. Fry.' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith('/my-recipes/review');
    expect(useImportSession.getState().pending).toMatchObject({
      recipe: { title: 'Garlic fried rice' },
      source: { kind: 'text', url: null },
      remaining: 19,
    });
  });

  it('sends a pasted link, adding https to a bare address', async () => {
    const user = userEvent.setup();
    const importRecipe = jest.fn(() => Promise.resolve(OK));
    await renderWithTheme(<AddRecipeScreen importDeps={deps(importRecipe)} />);
    await fireEvent.changeText(screen.getByTestId('link-input'), 'example.com/sinangag');
    await user.press(screen.getByTestId('link-submit'));
    expect(importRecipe).toHaveBeenCalledWith(
      { source: 'link', url: 'https://example.com/sinangag' },
      expect.anything(),
    );
  });

  it('says when there is no recipe, and stays put', async () => {
    await typeRecipe(() =>
      Promise.resolve({
        status: 'not_recipe',
        reason: 'no_recipe',
        message: "We couldn't find a recipe in that.",
        quota: QUOTA,
      }),
    );
    expect(await screen.findByText('No recipe found')).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('turns importing off once the daily limit is reached', async () => {
    await typeRecipe(() =>
      Promise.reject(
        new ApiError({
          functionName: 'recipe-import',
          kind: 'rate_limited',
          code: 'quota_exceeded',
          retryAfterSeconds: 3600,
        }),
      ),
    );
    expect(await screen.findByText("You've reached today's import limit")).toBeOnTheScreen();
    expect(
      screen.getByText('Daily limit reached. Imports refresh in about 60 minutes.'),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('recipe-text-submit')).toBeDisabled();
  });

  it('says when the person is offline', async () => {
    await typeRecipe(() =>
      Promise.reject(new ApiError({ functionName: 'recipe-import', kind: 'network' })),
    );
    expect(await screen.findByText("You're offline")).toBeOnTheScreen();
    expect(screen.getByTestId('import-retry')).toBeOnTheScreen();
  });

  it('shows the AI gate to someone who has not turned AI on', async () => {
    useSessionStore.getState().signedIn({
      userId: 'person-1',
      birthYear: thisYear - 35,
      onboardingComplete: true,
      aiConsent: false,
    });
    await renderWithTheme(<AddRecipeScreen importDeps={deps(jest.fn())} />);
    expect(screen.queryByTestId('method-type')).toBeNull();
  });
});
