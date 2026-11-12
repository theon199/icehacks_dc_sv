import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { ApiError } from '@/lib/api/errors';

import { useComposeDraftStore } from '../compose/draftStore';
import { publishPost } from '../deps';
import { ComposeScreen } from './ComposeScreen';
import { emptyDraft } from '../logic/compose';
import { renderWithClient } from '../testing/renderWithClient';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => false,
    requestPermissionsAsync: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  },
  useSpeechRecognitionEvent: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
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
  publishPost: jest.fn(),
  getRecipeSummaries: jest.fn(async () => []),
  searchRecipes: jest.fn(async () => []),
  listSavedRecipeIds: jest.fn(async () => []),
  listCookedRecipeIds: jest.fn(async () => []),
}));

const publishMock = jest.mocked(publishPost);

beforeEach(() => {
  useSessionStore.setState({ userId: 'me', status: 'ready' });
  useComposeDraftStore.setState({ ownerId: 'me', draft: emptyDraft });
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
    await waitFor(() => expect(router.back).toHaveBeenCalled());
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
});
