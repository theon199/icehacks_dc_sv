import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { ComponentType, ReactNode } from 'react';

import { useSessionStore } from '@/features/auth';
import type { NearbyResponse } from '@/lib/api/commerce';
import { renderWithTheme } from '@/test/render';

import { useConfirmationStore } from '../confirmationStore';
import { NearbyResults } from './NearbyResults';
import { CARD_GAP } from './PlaceStrip';
import type { NearbyLocation } from '../hooks/useNearbyLocation';

const mockAnimateCamera = jest.fn();
const mockAnimateToRegion = jest.fn();
const mockFetchNearby = jest.fn<Promise<NearbyResponse>, unknown[]>();
const mockRpc = jest.fn();
const mockTips = jest.fn();

jest.mock('react-native-maps', () => {
  const { createElement, useImperativeHandle } = jest.requireActual<{
    createElement: (...args: unknown[]) => ReactNode;
    useImperativeHandle: (ref: never, create: () => object) => void;
  }>('react');
  const { Pressable, View } = jest.requireActual<{
    Pressable: ComponentType<object>;
    View: ComponentType<object>;
  }>('react-native');
  function MapView(props: { children?: ReactNode; testID?: string; ref?: unknown }) {
    useImperativeHandle(props.ref as never, () => ({
      animateCamera: mockAnimateCamera,
      animateToRegion: mockAnimateToRegion,
    }));
    return createElement(View, { testID: props.testID }, props.children);
  }
  function Marker(props: { testID?: string; onPress?: () => void; pinColor?: string }) {
    return createElement(Pressable, {
      testID: props.testID,
      onPress: props.onPress,
      accessibilityHint: props.pinColor,
    });
  }
  return { __esModule: true, default: MapView, Marker };
});

jest.mock('@/lib/api/commerce', () => ({
  fetchNearbyPlaces: (...args: unknown[]) => mockFetchNearby(...args),
}));

jest.mock('@/lib/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

jest.mock('@/lib/api/ai', () => ({
  ...jest.requireActual<object>('@/lib/api/ai'),
  aiApi: { nearbyTips: (...args: unknown[]) => mockTips(...args) },
}));

const place = (id: string, name: string, lat: number) => ({
  id,
  name,
  address: `${name} St`,
  lat,
  lng: -74,
  distanceM: 500,
  rating: 4.5,
  ratingCount: 80,
  priceLevel: 2,
  openNow: true,
  primaryType: 'thai_restaurant',
  yesCount: 0,
  noCount: 0,
  myAnswer: null,
  score: 1,
});

const response: NearbyResponse = {
  configured: true,
  places: [place('a', 'Alpha Kitchen', 40.71), place('b', 'Basil House', 40.72)],
  cached: false,
  fetchedAt: null,
  notice: null,
};

const dish = { name: 'Pad Thai', key: 'pad_thai', cuisine: 'thai', recipeId: null };
const origin = {
  point: { latitude: 40.7, longitude: -74 },
  source: 'device' as const,
  label: null,
};
const location = { chooseCity: jest.fn() } as unknown as NearbyLocation;

function renderResults() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderWithTheme(
    <QueryClientProvider client={client}>
      <NearbyResults dish={dish} origin={origin} location={location} />
    </QueryClientProvider>,
  );
}

const isSelected = (id: string) =>
  screen.getByTestId(`nearby-card-${id}`).props.accessibilityState?.selected === true;

beforeEach(() => {
  mockFetchNearby.mockResolvedValue(response);
  useConfirmationStore.setState({ log: {} });
  useSessionStore.setState({ userId: 'user-1', birthYear: 1990, aiConsent: true });
});

describe('NearbyResults', () => {
  it('searches with the dish and origin and lists every place', async () => {
    await renderResults();
    expect(await screen.findByText('Alpha Kitchen')).toBeTruthy();
    expect(screen.getByText('Basil House')).toBeTruthy();
    expect(mockFetchNearby).toHaveBeenCalledWith(
      expect.objectContaining({ dish: 'Pad Thai', dishKey: 'pad_thai', lat: 40.7, lng: -74 }),
      expect.anything(),
    );
    expect(isSelected('a')).toBe(true);
  });

  it('selects the card when its marker is tapped, without moving the map', async () => {
    await renderResults();
    await screen.findByText('Basil House');
    mockAnimateCamera.mockClear();

    await fireEvent.press(screen.getByTestId('nearby-marker-b'));
    expect(isSelected('b')).toBe(true);
    expect(isSelected('a')).toBe(false);
    expect(mockAnimateCamera).not.toHaveBeenCalled();
  });

  it('moves the map to the card the strip settles on', async () => {
    await renderResults();
    await screen.findByText('Basil House');
    const card = screen.getByTestId('nearby-card-a');
    const width = Number((card.props.style as { width?: number }[]).find((s) => s?.width)?.width);

    await fireEvent(screen.getByTestId('nearby-strip'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: width + CARD_GAP, y: 0 } },
    });
    expect(isSelected('b')).toBe(true);
    expect(mockAnimateCamera).toHaveBeenLastCalledWith(
      { center: { latitude: 40.72, longitude: -74 } },
      expect.anything(),
    );
    expect(screen.getByTestId('nearby-marker-b').props.accessibilityHint).not.toBe(
      screen.getByTestId('nearby-marker-a').props.accessibilityHint,
    );
  });

  it('records one answer per place per day and thanks the person', async () => {
    mockRpc.mockResolvedValue({
      data: { place_id: 'b', dish_key: 'pad_thai', yes_count: 1, no_count: 0, my_answer: true },
      error: null,
    });
    await renderResults();
    await fireEvent.press(await screen.findByTestId('nearby-card-b'));
    await fireEvent.press(await screen.findByTestId('nearby-confirm-yes'));

    expect(await screen.findByText('Thanks for letting us know')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('confirm_dish', {
      p_place_id: 'b',
      p_dish_key: 'pad_thai',
      p_had_it: true,
    });
    await waitFor(() =>
      expect(screen.getAllByText('1 of 1 member found it here').length).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId('nearby-confirm-no')).toBeNull();
  });

  it('lets the person answer again when the server rejects the answer', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PT429', message: 'rate_limited' } });
    await renderResults();
    await fireEvent.press(await screen.findByTestId('nearby-card-a'));
    await fireEvent.press(await screen.findByTestId('nearby-confirm-no'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('nearby-confirm-no')).toBeTruthy();
    expect(useConfirmationStore.getState().log).toEqual({});
  });

  it('gets ordering tips on request for people who may use AI', async () => {
    mockTips.mockResolvedValue({
      tips: ['Ask for extra vegetables.', 'Ask for the sauce on the side.'],
      quota: { remaining: 9, reset_at: '2026-11-12T00:00:00Z' },
    });
    await renderResults();
    await fireEvent.press(await screen.findByTestId('nearby-card-a'));
    expect(mockTips).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByTestId('nearby-tips-request'));
    expect(await screen.findByText('Ask for extra vegetables.')).toBeTruthy();
    expect(mockTips).toHaveBeenCalledWith(
      expect.objectContaining({
        dish: { name: 'Pad Thai', cuisine: 'thai' },
        places: [
          { name: 'Alpha Kitchen', cuisine: 'Thai restaurant', rating: 4.5 },
          { name: 'Basil House', cuisine: 'Thai restaurant', rating: 4.5 },
        ],
      }),
      expect.anything(),
    );
  });

  it('keeps ordering tips locked without AI consent', async () => {
    await act(() => useSessionStore.setState({ aiConsent: false }));
    await renderResults();
    await fireEvent.press(await screen.findByTestId('nearby-card-a'));
    expect(await screen.findByTestId('nearby-tips-locked')).toBeTruthy();
    expect(screen.getByText('Review AI features')).toBeTruthy();
    expect(screen.queryByTestId('nearby-tips-request')).toBeNull();
  });

  it('shows an empty state with a way to search elsewhere', async () => {
    mockFetchNearby.mockResolvedValue({ ...response, places: [] });
    await renderResults();
    expect(await screen.findByText('No Pad Thai found nearby')).toBeTruthy();
    await fireEvent.press(screen.getByText('Search another area'));
    expect(location.chooseCity).toHaveBeenCalled();
  });
});
