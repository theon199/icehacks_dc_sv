import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import { aiApi, type ChefRequest, type ChefResponse } from '@/lib/api/ai';
import { ApiError } from '@/lib/api/errors';
import { getRecipeSummaries, listCandidates, searchRecipes } from '@/lib/catalog/queries';
import { useChefStore, usePreferencesStore } from '@/stores';
import { renderWithTheme } from '@/test/render';

import { ChefScreen } from './ChefScreen';
import { answeredPrefs, recipe } from '../__fixtures__/recipe';
import { resetChefSession, useChefSession } from '../hooks/chefSession';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

let mockIds = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockIds}` }));

jest.mock('@/lib/catalog/queries', () => ({
  getRecipeDetail: jest.fn(),
  getRecipeSummaries: jest.fn(),
  listCandidates: jest.fn(),
  searchRecipes: jest.fn(),
}));

const safe = recipe('r:safe', { title: 'Lemony lentil soup' });
const satay = recipe('r:satay', { title: 'Peanut satay', allergens: { peanut: 'contains' } });
const catalog = [safe, satay];

const askChef = jest.spyOn(aiApi, 'askChef');
const thisYear = new Date().getFullYear();
const initialSession = useSessionStore.getState();
let client: QueryClient;

function signIn(age: number, aiConsent = true) {
  useSessionStore.getState().signedIn({
    userId: 'person-1',
    birthYear: thisYear - age - 1,
    onboardingComplete: true,
    aiConsent,
  });
}

function reply(overrides: Partial<ChefResponse> = {}): ChefResponse {
  return {
    reply: 'Try the **lentil soup**.',
    recipe_ids: ['r:safe'],
    follow_ups: ['Can I make it spicier?'],
    quota: { remaining: 40, reset_at: '2026-11-12T00:00:00.000Z' },
    ...overrides,
  };
}

async function renderChef(threadId?: string) {
  return renderWithTheme(
    <QueryClientProvider client={client}>
      <ChefScreen threadId={threadId} />
    </QueryClientProvider>,
  );
}

async function ask(question: string) {
  const user = userEvent.setup();
  await user.type(screen.getByTestId('chef-input'), question);
  await user.press(screen.getByTestId('chef-send'));
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSessionStore.setState(initialSession, true);
  useChefStore.getState().reset();
  resetChefSession();
  usePreferencesStore.setState({ prefs: answeredPrefs({ allergens: ['peanut'] }) });
  askChef.mockReset();
  jest.mocked(listCandidates).mockResolvedValue(catalog.map((r) => ({ ...r, ingredientIds: [] })));
  jest.mocked(searchRecipes).mockResolvedValue({ items: catalog, nextCursor: null });
  jest
    .mocked(getRecipeSummaries)
    .mockImplementation(async (ids) => catalog.filter((r) => ids.includes(r.id)));
});

afterEach(() => client.clear());

function onlyThread() {
  const threads = Object.values(useChefStore.getState().threads);
  expect(threads).toHaveLength(1);
  return threads[0]!;
}

describe('ChefScreen', () => {
  it('is closed to people under 18', async () => {
    signIn(16);
    await renderChef();
    expect(screen.getByText('Chef is for adults')).toBeOnTheScreen();
    expect(screen.queryByTestId('chef-input')).toBeNull();
  });

  it('asks for consent before an adult can chat', async () => {
    signIn(30, false);
    await renderChef();
    expect(screen.getByText('Turn on AI features to use Chef')).toBeOnTheScreen();
    expect(screen.queryByTestId('chef-input')).toBeNull();
  });

  it('offers only screened recipes and keeps only safe ids from the reply', async () => {
    signIn(30);
    askChef.mockResolvedValue(reply({ recipe_ids: ['r:satay', 'r:safe', 'r:made-up'] }));
    await renderChef();
    await ask('Something with lentils');

    expect(await screen.findByTestId('chef-recipe-r:safe')).toBeOnTheScreen();
    const request = askChef.mock.calls[0]![0] as ChefRequest;
    expect(request.candidates.map((c) => c.id)).toEqual(['r:safe']);
    expect(request.profile.allergens).toEqual(['peanut']);
    expect(request.messages).toEqual([{ role: 'user', content: 'Something with lentils' }]);

    const thread = onlyThread();
    expect(thread.messages.map((m) => [m.role, m.recipeIds])).toEqual([
      ['user', []],
      ['assistant', ['r:safe']],
    ]);
    expect(screen.queryByTestId('chef-recipe-r:satay')).toBeNull();
    expect(screen.getByText('Can I make it spicier?')).toBeOnTheScreen();
  });

  it('re-screens stored recipes against the current allergens before showing them', async () => {
    signIn(30);
    const store = useChefStore.getState();
    const id = store.startThread('Old chat');
    store.append(id, { role: 'user', text: 'Ideas?' });
    store.append(id, { role: 'assistant', text: 'Here.', recipeIds: ['r:safe', 'r:satay'] });
    await renderChef(id);
    expect(await screen.findByTestId('chef-recipe-r:safe')).toBeOnTheScreen();
    expect(screen.queryByTestId('chef-recipe-r:satay')).toBeNull();

    await act(async () =>
      usePreferencesStore.setState({ prefs: answeredPrefs({ allergens: ['peanut', 'milk'] }) }),
    );
    expect(screen.getByTestId('chef-recipe-r:safe')).toBeOnTheScreen();
  });

  it('explains a spent daily limit, keeps the question and offers no retry', async () => {
    signIn(30);
    askChef.mockRejectedValue(
      new ApiError({
        kind: 'rate_limited',
        functionName: 'chef',
        status: 429,
        code: 'quota_exceeded',
        retryAfterSeconds: 2 * 3600,
      }),
    );
    await renderChef();
    await ask('Dinner?');

    expect(await screen.findByText("You've reached today's Chef limit")).toBeOnTheScreen();
    expect(screen.getByText(/refresh in about 2 hours/)).toBeOnTheScreen();
    expect(screen.queryByTestId('chef-retry')).toBeNull();
    expect(onlyThread().messages.map((m) => m.text)).toEqual(['Dinner?']);
  });

  it('retries after a dropped connection without repeating the question', async () => {
    signIn(30);
    askChef
      .mockRejectedValueOnce(new ApiError({ kind: 'network', functionName: 'chef' }))
      .mockResolvedValueOnce(reply());
    await renderChef();
    await ask('Dinner?');

    await userEvent.setup().press(await screen.findByTestId('chef-retry'));
    await waitFor(() => expect(onlyThread().messages).toHaveLength(2));
    expect(askChef).toHaveBeenCalledTimes(2);
    expect(onlyThread().messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('keeps an answer that arrives after the screen has gone away', async () => {
    signIn(30);
    let answer: (value: ChefResponse) => void = () => undefined;
    askChef.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const view = await renderChef();
    await ask('Dinner?');
    await waitFor(() => expect(askChef).toHaveBeenCalledTimes(1));
    view.unmount();

    answer(reply());
    await waitFor(() =>
      expect(onlyThread().messages.map((m) => m.role)).toEqual(['user', 'assistant']),
    );
    // The suggestions wait for the next time the thread is opened.
    expect(useChefSession.getState().followUps[onlyThread().id]).toEqual([
      'Can I make it spicier?',
    ]);
  });

  it('does not offer to ask again once the daily limit is spent', async () => {
    signIn(30);
    askChef.mockRejectedValue(
      new ApiError({
        kind: 'rate_limited',
        functionName: 'chef',
        status: 429,
        code: 'quota_exceeded',
        retryAfterSeconds: 3600,
      }),
    );
    await renderChef();
    await ask('Dinner?');
    await screen.findByTestId('chef-problem');

    await userEvent.setup().press(screen.getByText('Dismiss'));
    expect(screen.queryByTestId('chef-problem')).toBeNull();
    expect(screen.queryByTestId('chef-ask-again')).toBeNull();
    expect(screen.getByText("You've reached today's Chef limit.")).toBeOnTheScreen();
  });
});
