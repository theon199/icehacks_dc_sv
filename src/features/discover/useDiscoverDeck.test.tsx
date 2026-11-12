/**
 * The deck hook against a fixture catalog: real stores, real ranking, a fake catalog query that
 * applies the same coarse filters SQL would.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { DeckMode } from '@/domain';
import { listCandidates } from '@/lib/catalog/queries';
import type { CandidateFilters, RecipeCandidate } from '@/lib/catalog/types';
import {
  selectFeedbackEvents,
  useFeedbackStore,
  usePantryStore,
  usePreferencesStore,
  useSavedStore,
} from '@/stores';

import {
  candidate,
  FIXTURE_CATALOG,
  PEANUT_DISH,
  UNVERIFIED_PEANUT_DISH,
} from './__fixtures__/catalog';
import { UNDO_WINDOW_MS, useDiscoverDeck, type DiscoverDeck } from './useDiscoverDeck';

jest.mock('@/lib/catalog/queries', () => ({
  listCandidates: jest.fn(),
  getRecipeDetail: jest.fn(() => Promise.resolve(null)),
}));

// Feedback events get ids from the platform's secure random source; Node's stands in for it.
jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

const NOW = Date.parse('2026-11-11T09:30:00.000Z');
const options = { seed: 'test-seed', now: () => NOW };

/** What the SQL filters would do, applied in memory. */
function fakeQuery(catalog: readonly RecipeCandidate[]) {
  return (filters: CandidateFilters): Promise<RecipeCandidate[]> =>
    Promise.resolve(
      catalog
        .filter((recipe) =>
          (filters.avoidAllergens ?? []).every((allergen) => recipe.allergens[allergen] === 'free'),
        )
        .filter(
          (recipe) =>
            filters.maxMinutes === undefined ||
            (recipe.totalMinutes ?? Infinity) <= filters.maxMinutes,
        )
        .filter((recipe) => !filters.gentle || recipe.gentle)
        .slice(0, filters.limit),
    );
}

const clients: QueryClient[] = [];

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

async function renderDeck(mode: DeckMode = 'forYou') {
  const view = await renderHook(
    ({ deckMode }: { deckMode: DeckMode }) => useDiscoverDeck(deckMode, options),
    { wrapper: wrapper(), initialProps: { deckMode: mode } },
  );
  return view;
}

async function untilReady(result: { current: DiscoverDeck }) {
  await waitFor(() => expect(result.current.status).toBe('ready'));
}

const ids = (deck: DiscoverDeck) => deck.cards.map((card) => card.recipe.id);
const feedback = () => selectFeedbackEvents(useFeedbackStore.getState());

beforeEach(() => {
  jest
    .mocked(listCandidates)
    .mockImplementation(fakeQuery([...FIXTURE_CATALOG, PEANUT_DISH, UNVERIFIED_PEANUT_DISH]));
  usePreferencesStore.getState().reset();
  useFeedbackStore.getState().reset();
  useSavedStore.getState().reset();
  usePantryStore.getState().reset();
  usePreferencesStore.getState().update({ cuisines: ['italian'] });
  usePreferencesStore.getState().setAllergens(['peanut']);
});

afterEach(() => {
  jest.useRealTimers();
  for (const client of clients.splice(0)) client.clear();
});

describe('useDiscoverDeck', () => {
  it('asks for preferences and queries nothing until allergens are answered', async () => {
    usePreferencesStore.getState().reset();
    const { result } = await renderDeck();
    expect(result.current.status).toBe('needsPreferences');
    expect(result.current.cards).toEqual([]);
    expect(listCandidates).not.toHaveBeenCalled();
  });

  it('ranks a safe, personalised deck from the catalog', async () => {
    const { result } = await renderDeck();
    await untilReady(result);
    const deck = result.current;
    expect(deck.cards.length).toBeGreaterThanOrEqual(4);
    expect(ids(deck)).not.toContain(PEANUT_DISH.id);
    expect(ids(deck)).not.toContain(UNVERIFIED_PEANUT_DISH.id);
    for (const card of deck.cards) {
      expect(card.fitScore).toBeGreaterThanOrEqual(0);
      expect(card.fitScore).toBeLessThanOrEqual(100);
      expect(card.reasons.length).toBeGreaterThanOrEqual(2);
    }
    const italian = deck.cards.find((card) => card.recipe.cuisine === 'italian');
    expect(italian?.reasons.map((reason) => reason.text)).toContain('You love Italian food');
  });

  it('re-checks safety even when the query lets an unsafe dish through', async () => {
    jest.mocked(listCandidates).mockResolvedValue([PEANUT_DISH, UNVERIFIED_PEANUT_DISH]);
    const { result } = await renderDeck();
    await waitFor(() => expect(result.current.status).toBe('exhausted'));
    expect(result.current.cards).toEqual([]);
  });

  it('replays the same deck for the same seed', async () => {
    const first = await renderDeck();
    await untilReady(first.result);
    const order = ids(first.result.current);
    await first.unmount();
    const second = await renderDeck();
    await untilReady(second.result);
    expect(ids(second.result.current)).toEqual(order);
  });

  it('records a swipe once the next one is made, and the last one on unmount', async () => {
    const { result, unmount } = await renderDeck();
    await untilReady(result);
    const [first, second] = result.current.cards;

    await act(async () => result.current.like(first!));
    expect(feedback()).toEqual([]);
    expect(result.current.cards[0]?.recipe.id).toBe(second!.recipe.id);

    await act(async () => result.current.pass(second!));
    expect(feedback()).toMatchObject([{ recipeId: first!.recipe.id, kind: 'like' }]);

    await unmount();
    // Both share the fixed test clock, so their stored order is arbitrary.
    expect(feedback()).toHaveLength(2);
    expect(feedback()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipeId: first!.recipe.id, kind: 'like' }),
        expect.objectContaining({ recipeId: second!.recipe.id, kind: 'pass' }),
      ]),
    );
  });

  it('records the held swipe when the undo window passes', async () => {
    const { result } = await renderDeck();
    await untilReady(result);
    jest.useFakeTimers();
    await act(async () => result.current.like(result.current.cards[0]!));
    expect(feedback()).toEqual([]);
    await act(async () => jest.advanceTimersByTime(UNDO_WINDOW_MS));
    expect(feedback()).toHaveLength(1);
    expect(result.current.lastDecision).toBeNull();
  });

  it('undoes the last swipe without recording anything', async () => {
    const { result, unmount } = await renderDeck();
    await untilReady(result);
    const before = ids(result.current);
    await act(async () => result.current.pass(result.current.cards[0]!));
    expect(result.current.lastDecision?.kind).toBe('pass');
    await act(async () => result.current.undo());
    expect(ids(result.current)).toEqual(before);
    expect(result.current.lastDecision).toBeNull();
    await unmount();
    expect(feedback()).toEqual([]);
  });

  it('saves to the cookbook right away and undo takes it back out', async () => {
    const { result, unmount } = await renderDeck();
    await untilReady(result);
    const card = result.current.cards[0]!;
    await act(async () => result.current.save(card));
    expect(useSavedStore.getState().saved[card.recipe.id]).toBeDefined();
    await act(async () => result.current.undo());
    expect(useSavedStore.getState().saved[card.recipe.id]).toBeUndefined();

    await act(async () => result.current.save(result.current.cards[0]!));
    await unmount();
    expect(feedback()).toMatchObject([{ recipeId: card.recipe.id, kind: 'save' }]);
    expect(useSavedStore.getState().saved[card.recipe.id]).toBeDefined();
  });

  it('records "not for me" with its reason and the disliked ingredient', async () => {
    const { result, unmount } = await renderDeck();
    await untilReady(result);
    const [first, second] = result.current.cards;
    await act(async () => result.current.notForMe(first!, 'too_long'));
    await act(async () => result.current.notForMe(second!, 'dislike_ingredient', 'cilantro'));
    await unmount();
    // Both share the fixed test clock, so their stored order is arbitrary.
    expect(feedback()).toHaveLength(2);
    expect(feedback()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipeId: first!.recipe.id,
          kind: 'not_for_me',
          reason: 'too_long',
          ingredientId: null,
        }),
        expect.objectContaining({
          recipeId: second!.recipe.id,
          kind: 'not_for_me',
          reason: 'dislike_ingredient',
          ingredientId: 'cilantro',
        }),
      ]),
    );
  });

  it('tops the deck up when fewer than four cards are left, never repeating a swiped card', async () => {
    const { result } = await renderDeck();
    await untilReady(result);
    const swiped = new Set<string>();
    while (result.current.cards.length >= 4) {
      const top = result.current.cards[0]!;
      swiped.add(top.recipe.id);
      await act(async () => result.current.pass(top));
    }
    await waitFor(() => expect(result.current.cards.length).toBeGreaterThanOrEqual(4));
    for (const id of ids(result.current)) expect(swiped.has(id)).toBe(false);
  });

  it('switches to Quick with only dishes inside the time limit', async () => {
    const view = await renderDeck();
    await untilReady(view.result);
    await view.rerender({ deckMode: 'quick' });
    await waitFor(() => {
      expect(view.result.current.mode).toBe('quick');
      expect(view.result.current.status).toBe('ready');
    });
    for (const card of view.result.current.cards) {
      expect(card.recipe.totalMinutes).toBeLessThanOrEqual(30);
    }
    expect(listCandidates).toHaveBeenLastCalledWith(expect.objectContaining({ maxMinutes: 30 }));
  });

  it('only serves Gentle with small appetite mode on, at half portions', async () => {
    const view = await renderDeck('gentle');
    await untilReady(view.result);
    expect(view.result.current.mode).toBe('forYou');

    await act(async () => usePreferencesStore.getState().update({ smallAppetite: true }));
    await waitFor(() => {
      expect(view.result.current.mode).toBe('gentle');
      expect(view.result.current.status).toBe('ready');
    });
    for (const card of view.result.current.cards) {
      expect(card.recipe.gentle).toBe(true);
      expect(card.portionScale).toBe(0.5);
    }
  });

  it('drops cards that become unsafe the moment an allergen is added', async () => {
    jest
      .mocked(listCandidates)
      .mockImplementation(
        fakeQuery(
          FIXTURE_CATALOG.map((recipe, i) =>
            i % 2 === 0
              ? candidate(recipe.id, { ...recipe, allergens: { sesame: 'contains' } })
              : recipe,
          ),
        ),
      );
    const { result } = await renderDeck();
    await untilReady(result);
    expect(result.current.cards.some((card) => card.recipe.allergens.sesame === 'contains')).toBe(
      true,
    );
    await act(async () => usePreferencesStore.getState().setAllergens(['peanut', 'sesame']));
    expect(result.current.cards.some((card) => card.recipe.allergens.sesame !== 'free')).toBe(
      false,
    );
    await untilReady(result);
    expect(result.current.cards.every((card) => card.recipe.allergens.sesame === 'free')).toBe(
      true,
    );
  });

  it('reports an exhausted deck once every card is swiped', async () => {
    jest.mocked(listCandidates).mockImplementation(fakeQuery(FIXTURE_CATALOG.slice(0, 2)));
    const { result } = await renderDeck();
    await untilReady(result);
    for (const card of [...result.current.cards]) await act(async () => result.current.pass(card));
    await waitFor(() => expect(result.current.status).toBe('exhausted'));
    expect(result.current.lastDecision?.kind).toBe('pass');
  });
});
