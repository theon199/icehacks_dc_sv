import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { ApiError } from '@/lib/api/errors';
import { getRecipeSummaries } from '@/lib/catalog';
import { useCookLogStore, useSavedStore, type CookEntry } from '@/stores';

import { fetchPost } from '../api/communityApi';
import { useComposeDraftStore } from '../compose/draftStore';
import { publishPost } from '../deps';
import { ComposeScreen } from './ComposeScreen';
import { emptyDraft } from '../logic/compose';
import { parseCookShare } from '../logic/composeParams';
import { makePost, makeRecipe } from '../testing/fixtures';
import { renderWithClient } from '../testing/renderWithClient';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));

// Dictation is unavailable in these tests, so the mic button stays hidden.
jest.mock('expo-speech-recognition', () => {
  const speech = {
    isRecognitionAvailable: () => false,
    requestPermissionsAsync: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  };
  return { ExpoSpeechRecognitionModule: speech, useSpeechRecognitionEvent: () => undefined };
});

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
}));

jest.mock('../compose/photoUpload', () => ({
  preparePhoto: jest.fn(),
  blurhashFor: jest.fn(),
  uploadPhoto: jest.fn(),
}));

jest.mock('../api/communityApi', () => ({
  fetchPost: jest.fn(async () => null),
  fetchWeeklyTopDishes: jest.fn(async () => []),
}));

jest.mock('../deps', () => ({
  ...jest.requireActual<Record<string, unknown>>('../deps'),
  publishPost: jest.fn(),
}));

jest.mock('@/lib/catalog', () => ({
  getRecipeSummaries: jest.fn(async () => []),
  searchRecipes: jest.fn(async () => ({ items: [], nextCursor: null })),
}));

const publishMock = jest.mocked(publishPost);
const goBackMock = jest.mocked(router.back);
const summariesMock = jest.mocked(getRecipeSummaries);
const fetchPostMock = jest.mocked(fetchPost);

const soup = makeRecipe({ id: 'mealdb:7', title: 'Red lentil soup' });
const stew = makeRecipe({ id: 'mealdb:8', title: 'Bean stew' });
const salad = makeRecipe({ id: 'mealdb:9', title: 'Herb salad' });
const catalog = [soup, stew, salad];

/** Answers like the catalog: known ids in the order asked, unknown ids skipped. */
async function lookup(ids: readonly string[]) {
  return ids.flatMap((id) => catalog.filter((recipe) => recipe.id === id));
}

function cooked(id: string, recipeId: string, cookedAt: string): CookEntry {
  return {
    id,
    recipeId,
    cookedAt,
    rating: null,
    wouldCookAgain: null,
    notes: null,
    servings: null,
  };
}

beforeEach(() => {
  useSessionStore.setState({ userId: 'me', status: 'ready' });
  useComposeDraftStore.setState({ ownerId: 'me', draft: emptyDraft });
  useSavedStore.setState({ saved: {} });
  useCookLogStore.setState({ entries: {} });
  summariesMock.mockImplementation(lookup);
  fetchPostMock.mockResolvedValue(null);
});

describe('ComposeScreen', () => {
  it('explains what is missing instead of posting an incomplete draft', async () => {
    await renderWithClient(<ComposeScreen />);

    await fireEvent.press(screen.getByTestId('compose-publish'));

    expect(await screen.findByText('Pick the recipe this is about.')).toBeTruthy();
    expect(screen.getByText('Give your post a title.')).toBeTruthy();
    expect(screen.getByText('Add a photo of what you cooked.')).toBeTruthy();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('publishes a kitchen tip and clears the draft', async () => {
    publishMock.mockResolvedValue({ id: 'new', status: 'visible', kind: 'tip', title: 'x' });
    await renderWithClient(<ComposeScreen />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Kitchen tip' }));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Salt the pasta water');
    await fireEvent.changeText(
      screen.getByLabelText('Your tip'),
      '  About a teaspoon per litre.  ',
    );
    await fireEvent.press(screen.getByTestId('compose-publish'));

    await waitFor(() => expect(publishMock).toHaveBeenCalledTimes(1));
    expect(publishMock).toHaveBeenCalledWith({
      kind: 'tip',
      title: 'Salt the pasta water',
      body: 'About a teaspoon per litre.',
      recipeRef: null,
      rating: null,
      parentPostId: null,
      media: [],
    });
    await waitFor(() => expect(goBackMock).toHaveBeenCalled());
    expect(useComposeDraftStore.getState().draft).toEqual(emptyDraft);
  });

  it('keeps the draft and says why when publishing fails', async () => {
    publishMock.mockRejectedValue(
      new ApiError({ kind: 'rate_limited', functionName: 'publish', code: 'rate_limited' }),
    );
    const alert = jest.spyOn(Alert, 'alert');
    useComposeDraftStore.setState({
      ownerId: 'me',
      draft: {
        ...emptyDraft,
        kind: 'tip',
        title: 'Rinse rice',
        body: 'Until the water runs clear.',
      },
    });
    await renderWithClient(<ComposeScreen />);

    await fireEvent.press(screen.getByTestId('compose-publish'));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0]?.[1]).toMatch(/posted a lot/);
    expect(useComposeDraftStore.getState().draft.title).toBe('Rinse rice');
  });

  it('starts a cook post from what cook mode handed over', async () => {
    const cookShare = parseCookShare({
      from: 'cook',
      rating: '4',
      note: 'Used half the salt.',
      photo: 'file:///cache/dinner.jpg',
      photoWidth: '1200',
      photoHeight: '900',
    });
    await renderWithClient(<ComposeScreen recipeId="mealdb:7" cookShare={cookShare} />);

    await waitFor(() => expect(useComposeDraftStore.getState().draft.recipeId).toBe('mealdb:7'));
    expect(useComposeDraftStore.getState().draft).toMatchObject({
      kind: 'cook',
      recipeTitle: 'Red lentil soup',
      title: 'Red lentil soup',
      rating: 4,
      body: 'Used half the salt.',
      photos: [{ uri: 'file:///cache/dinner.jpg', width: 1200, height: 900 }],
    });
    expect(screen.getByDisplayValue('Used half the salt.')).toBeTruthy();
  });

  it('waits for the parent recipe before filling a remix opened from a link', async () => {
    fetchPostMock.mockResolvedValue(
      makePost({ id: 'post-42', title: 'Grandma’s dal', recipe_ref: 'mealdb:7' }),
    );
    let finishLookup: () => void = () => undefined;
    summariesMock.mockImplementation(
      (ids) =>
        new Promise((resolve) => {
          finishLookup = () => void lookup(ids).then(resolve);
        }),
    );
    await renderWithClient(<ComposeScreen remixOf="post-42" />);

    await waitFor(() => expect(summariesMock).toHaveBeenCalledWith(['mealdb:7']));
    expect(useComposeDraftStore.getState().draft).toEqual(emptyDraft);

    await act(async () => finishLookup());

    await waitFor(() =>
      expect(useComposeDraftStore.getState().draft).toMatchObject({
        kind: 'remix',
        parentPostId: 'post-42',
        recipeId: 'mealdb:7',
        recipeTitle: 'Red lentil soup',
        title: 'Red lentil soup, my way',
      }),
    );
  });

  it('says so when the post to remix cannot be opened', async () => {
    await renderWithClient(<ComposeScreen remixOf="post-gone" />);

    expect(await screen.findByText(/open the post you wanted to remix/)).toBeTruthy();
    expect(useComposeDraftStore.getState().draft).toEqual(emptyDraft);
  });

  it('offers saved and cooked recipes from the stores, without estimated meals', async () => {
    useSavedStore.setState({
      saved: { 'mealdb:9': { recipeId: 'mealdb:9', savedAt: '2026-11-01T10:00:00Z' } },
    });
    useCookLogStore.setState({
      entries: {
        a: cooked('a', 'mealdb:8', '2026-11-10T19:00:00Z'),
        b: cooked('b', 'snap:pho', '2026-11-11T19:00:00Z'),
      },
    });
    await renderWithClient(<ComposeScreen />);

    await fireEvent.press(screen.getByTestId('choose-recipe'));

    expect(await screen.findByLabelText('Choose Bean stew')).toBeTruthy();
    expect(screen.getByLabelText('Choose Herb salad')).toBeTruthy();
    expect(screen.getByText('Recently cooked')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    for (const [ids] of summariesMock.mock.calls) {
      expect(ids.some((id) => id.startsWith('snap:'))).toBe(false);
    }
  });
});
