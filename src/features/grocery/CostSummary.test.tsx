import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';

import { buildShoppingList } from '@/domain/shopping';
import { useSessionStore } from '@/features/auth';
import {
  createWalmartCart,
  fetchIngredientPrices,
  fetchWalmartPrices,
  fetchWalmartStatus,
  type IngredientPrice,
  type PriceRequest,
  type WalmartPrice,
} from '@/lib/api/commerce';
import { ApiError } from '@/lib/api/errors';
import { getIngredients, getRecipeDetail } from '@/lib/catalog/queries';
import { renderWithTheme } from '@/test/render';
import { useToastStore } from '@/ui';

import { CostSummary } from './CostSummary';
import { priceCache } from './priceCache';
import {
  answer,
  CATALOG_INGREDIENTS,
  PANCAKE_LINES,
  PANCAKE_RECIPE,
  priced,
  SHOPPING_INGREDIENTS,
} from './testing';

jest.mock('@/lib/catalog/queries', () => ({
  getRecipeDetail: jest.fn(),
  getIngredients: jest.fn(),
}));

jest.mock('@/lib/api/commerce', () => ({
  fetchIngredientPrices: jest.fn(),
  fetchWalmartStatus: jest.fn(),
  fetchWalmartPrices: jest.fn(),
  createWalmartCart: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));

// The first render loads several modules; give async queries room on slow machines.
configure({ asyncUtilTimeout: 5000 });

const FLOUR = priced('flour', 400, 1, 'kg');
const EGGS = priced('egg', 360, 1, 'dozen', { retailer: 'Green Grocer' });

function answerWith(answers: Record<string, IngredientPrice>) {
  jest.mocked(fetchIngredientPrices).mockImplementation(async (request: PriceRequest) => ({
    prices: request.items.map((item) => answers[item.id] ?? answer(item.id, 'not_found')),
    pending: 0,
    retryAfterSeconds: null,
    notice: null,
  }));
}

function walmartItem(ingredientId: string, status: WalmartPrice['status']): WalmartPrice {
  return {
    ingredientId,
    itemId: status === 'unmapped' ? null : `w-${ingredientId}`,
    status,
    name: ingredientId,
    priceCents: 100,
    size: null,
    available: status === 'found',
    url: null,
    image: null,
  };
}

function walmartWith(configured: boolean, statuses: Record<string, WalmartPrice['status']> = {}) {
  jest
    .mocked(fetchWalmartStatus)
    .mockResolvedValue(configured ? { configured: true, affiliate: true } : { configured: false });
  jest.mocked(fetchWalmartPrices).mockImplementation(async (ids) => ({
    configured: true,
    prices: ids.map((id) => walmartItem(id, statuses[id] ?? 'unmapped')),
  }));
}

const clients: QueryClient[] = [];

async function renderSummary(ui: ReactNode) {
  const client = new QueryClient({
    // Infinite gcTime keeps finished mutations from leaving garbage-collection timers behind.
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  clients.push(client);
  return await renderWithTheme(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  priceCache.clear();
  useToastStore.getState().clear();
  useSessionStore.setState({ status: 'ready', userId: 'u1' });
  jest.mocked(getRecipeDetail).mockResolvedValue(PANCAKE_RECIPE);
  jest
    .mocked(getIngredients)
    .mockImplementation(async (ids) => CATALOG_INGREDIENTS.filter((i) => ids.includes(i.id)));
  walmartWith(false);
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe('CostSummary for a recipe', () => {
  it('shows the per-serving and total estimate', async () => {
    answerWith({ flour: FLOUR, egg: EGGS });
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} />);
    // 500 g of a $4.00 kg bag + 3 of a $3.60 dozen = $2.90 for 4 servings.
    expect(await screen.findByText('$0.73')).toBeTruthy();
    expect(screen.getByText('per serving · $2.90 total')).toBeTruthy();
    expect(screen.getByLabelText('About $0.73 per serving, $2.90 in total')).toBeTruthy();
    expect(screen.getByText(/Pantry staples like salt/)).toBeTruthy();
  });

  it('costs the servings asked for', async () => {
    answerWith({ flour: FLOUR, egg: EGGS });
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} servings={8} />);
    expect(await screen.findByText('per serving · $5.80 total')).toBeTruthy();
  });

  it('names the items it could not price', async () => {
    answerWith({ flour: FLOUR, egg: EGGS });
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} />);
    expect(
      await screen.findByText(
        'Leaves out 2 items without a usable price: fresh parsley and tahini.',
      ),
    ).toBeTruthy();
  });

  it('says which prices are still being checked', async () => {
    answerWith({ flour: FLOUR, egg: EGGS, tahini: answer('tahini', 'pending') });
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} />);
    expect(await screen.findByText('Checking the price of tahini…')).toBeTruthy();
  });

  it('asks only for ingredients that must be bought', async () => {
    answerWith({ flour: FLOUR, egg: EGGS });
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} />);
    await screen.findByText('$0.73');
    const asked = jest
      .mocked(fetchIngredientPrices)
      .mock.calls.flatMap(([request]) => request.items.map((i) => i.id));
    expect(asked.sort()).toEqual(['egg', 'flour', 'tahini']);
  });

  it('shows saved prices without asking again', async () => {
    priceCache.write([FLOUR, EGGS, answer('tahini', 'not_found')]);
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} />);
    expect(await screen.findByText('$0.73')).toBeTruthy();
    expect(fetchIngredientPrices).not.toHaveBeenCalled();
  });

  it('explains a failed lookup and offers a retry', async () => {
    jest
      .mocked(fetchIngredientPrices)
      .mockRejectedValue(new ApiError({ kind: 'network', functionName: 'prices' }));
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} />);
    expect(await screen.findByText(/Couldn't reach the price service/)).toBeTruthy();
    expect(
      screen.getByText('No store prices are available for these ingredients yet.'),
    ).toBeTruthy();
    answerWith({ flour: FLOUR, egg: EGGS });
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('$0.73')).toBeTruthy();
  });

  it('renders nothing for a recipe the catalog does not have', async () => {
    jest.mocked(getRecipeDetail).mockResolvedValue(null);
    await renderSummary(<CostSummary recipeId="unknown" />);
    await waitFor(() => expect(getRecipeDetail).toHaveBeenCalled());
    expect(screen.queryByTestId('grocery-cost-summary')).toBeNull();
  });
});

describe('CostSummary for a shopping list', () => {
  const list = buildShoppingList({
    recipes: [{ recipeId: 'r', servings: 4, plannedServings: 4, ingredients: PANCAKE_LINES }],
    ingredients: SHOPPING_INGREDIENTS,
  });

  it('shows the total without a per-serving figure', async () => {
    answerWith({ flour: FLOUR, egg: EGGS });
    await renderSummary(<CostSummary list={list} />);
    expect(await screen.findByText('$2.90')).toBeTruthy();
    expect(screen.getByText('estimated total')).toBeTruthy();
    expect(screen.queryByText(/per serving/)).toBeNull();
  });

  it('shows a per-serving figure when told how many servings the list feeds', async () => {
    answerWith({ flour: FLOUR, egg: EGGS });
    await renderSummary(<CostSummary list={list} servings={2} />);
    expect(await screen.findByText('per serving · $2.90 total')).toBeTruthy();
    expect(screen.getByText('$1.45')).toBeTruthy();
  });

  it('notes when everything is already at home', async () => {
    const atHome = {
      items: list.items.filter((i) => i.staple),
      inPantry: list.items
        .filter((i) => !i.staple)
        .map((i) => ({ ...i, pantry: 'covered' as const })),
    };
    await renderSummary(<CostSummary list={atHome} />);
    expect(await screen.findByText(/already in your kitchen/)).toBeTruthy();
    expect(fetchIngredientPrices).not.toHaveBeenCalled();
  });
});

describe('sources sheet', () => {
  it('lists each price with its store, package, check date and link', async () => {
    answerWith({ flour: FLOUR, egg: EGGS });
    const openUrl = jest.fn();
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} openUrl={openUrl} />);
    expect(
      await screen.findByText(
        'Prices from Corner Market and Green Grocer. Estimates vary by store.',
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('grocery-sources-button'));
    expect(await screen.findByText('Price sources')).toBeTruthy();
    expect(screen.getByText('$4.00 for 1 kg at Corner Market')).toBeTruthy();
    expect(screen.getByText('$3.60 for 1 dozen at Green Grocer')).toBeTruthy();
    expect(screen.getAllByText(/Checked Nov 3, 2026/)).toHaveLength(2);
    expect(screen.getByText('Not in the estimate')).toBeTruthy();
    expect(screen.getAllByText('No store price found')).toHaveLength(2);

    await fireEvent.press(screen.getByTestId('grocery-source-flour'));
    expect(openUrl).toHaveBeenCalledWith('https://shop.example.com/p/flour');

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByText('Price sources')).toBeNull());
  });

  it('does not link listings without a safe https address', async () => {
    answerWith({ flour: { ...FLOUR, url: 'http://shop.example.com/flour' }, egg: EGGS });
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} />);
    await fireEvent.press(await screen.findByTestId('grocery-sources-button'));
    expect(await screen.findByText('$4.00 for 1 kg at Corner Market')).toBeTruthy();
    expect(screen.queryByTestId('grocery-source-flour')).toBeNull();
    expect(screen.getByTestId('grocery-source-egg')).toBeTruthy();
  });
});

describe('Buy at Walmart', () => {
  beforeEach(() => answerWith({ flour: FLOUR, egg: EGGS }));

  it('is hidden when Walmart is not configured', async () => {
    walmartWith(false);
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} />);
    await screen.findByText('$0.73');
    await waitFor(() => expect(fetchWalmartStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('grocery-walmart-button')).toBeNull();
    expect(fetchWalmartPrices).not.toHaveBeenCalled();
  });

  it('is hidden when no item to buy has a Walmart item', async () => {
    walmartWith(true, { flour: 'not_found', egg: 'unmapped' });
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} />);
    await screen.findByText('$0.73');
    await waitFor(() => expect(fetchWalmartPrices).toHaveBeenCalled());
    expect(screen.queryByTestId('grocery-walmart-button')).toBeNull();
  });

  it('is hidden when the screen opts out', async () => {
    walmartWith(true, { flour: 'found' });
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} hideWalmart />);
    await screen.findByText('$0.73');
    expect(screen.queryByTestId('grocery-walmart-button')).toBeNull();
    expect(fetchWalmartStatus).not.toHaveBeenCalled();
  });

  it('opens a cart of the mapped items and says what it left out', async () => {
    walmartWith(true, { flour: 'found', egg: 'found', tahini: 'unmapped' });
    jest.mocked(createWalmartCart).mockResolvedValue({
      configured: true,
      affiliate: true,
      url: 'https://www.walmart.com/cart?items=w-egg,w-flour',
      items: [{ ingredientId: 'egg', itemId: 'w-egg', quantity: 1 }],
      skipped: ['flour'],
    });
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} />);
    const button = await screen.findByTestId('grocery-walmart-button');
    expect(screen.getByText('Famara may earn a commission on Walmart purchases.')).toBeTruthy();

    await fireEvent.press(button);
    await waitFor(() =>
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
        'https://www.walmart.com/cart?items=w-egg,w-flour',
      ),
    );
    expect(createWalmartCart).toHaveBeenCalledWith({
      items: [
        { ingredient_id: 'egg', quantity: 1 },
        { ingredient_id: 'flour', quantity: 1 },
      ],
    });
    await waitFor(() =>
      expect(useToastStore.getState().queue.map((t) => t.message)).toContain(
        "flour isn't in the Walmart cart. Add it yourself.",
      ),
    );
  });

  it('reports a cart that could not be built', async () => {
    walmartWith(true, { flour: 'found' });
    jest
      .mocked(createWalmartCart)
      .mockRejectedValue(new ApiError({ kind: 'server', functionName: 'walmart', status: 502 }));
    await renderSummary(<CostSummary recipeId={PANCAKE_RECIPE.id} />);
    await fireEvent.press(await screen.findByTestId('grocery-walmart-button'));
    await waitFor(() =>
      expect(useToastStore.getState().queue.map((t) => t.message)).toContain(
        "Couldn't open the Walmart cart. Try again.",
      ),
    );
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });
});
