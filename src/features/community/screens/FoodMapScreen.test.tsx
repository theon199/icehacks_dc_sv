import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { ComponentType, ReactNode } from 'react';

import { useSessionStore } from '@/features/auth';
import {
  checkInAtPlace,
  fetchFoodMap,
  fetchPlacePhoto,
  type FoodMapResponse,
  type FoodRegion,
} from '@/lib/api/foodMap';
import { useToastStore } from '@/ui';

import { FoodMapScreen } from './FoodMapScreen';
import type { DeviceFix, FoodMapLocation, LocationAccess } from '../foodmap/location';
import { renderWithClient } from '../testing/renderWithClient';

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
  return { router, useRouter: () => router, Stack: { Screen: () => null } };
});

jest.mock('react-native-maps', () => {
  const { createElement } = jest.requireActual<{
    createElement: (...args: unknown[]) => ReactNode;
  }>('react');
  const { Pressable, View } = jest.requireActual<{
    Pressable: ComponentType<object>;
    View: ComponentType<object>;
  }>('react-native');
  function MapView(props: { children?: ReactNode; testID?: string }) {
    return createElement(View, { testID: props.testID }, props.children);
  }
  function Marker(props: { children?: ReactNode; testID?: string; onPress?: () => void }) {
    return createElement(
      Pressable,
      { testID: props.testID, onPress: props.onPress },
      props.children,
    );
  }
  function Polygon() {
    return null;
  }
  return { __esModule: true, default: MapView, Marker, Polygon };
});

jest.mock('@/lib/api/foodMap', () => ({
  ...jest.requireActual<object>('@/lib/api/foodMap'),
  fetchFoodMap: jest.fn(),
  checkInAtPlace: jest.fn(),
  fetchPlacePhoto: jest.fn(),
}));

const mapMock = jest.mocked(fetchFoodMap);
const checkInMock = jest.mocked(checkInAtPlace);
const photoMock = jest.mocked(fetchPlacePhoto);

const HERE: DeviceFix = { lat: 34.01, lng: -118.49, accuracyM: 12 };

function fakeLocation(access: LocationAccess, fix: DeviceFix = HERE): FoodMapLocation {
  let current = access;
  return {
    access: jest.fn(async () => current),
    requestAccess: jest.fn(async () => {
      current = { status: 'granted' };
      return current;
    }),
    currentFix: jest.fn(async () => fix),
    openSettings: jest.fn(async () => undefined),
  };
}

const ring: FoodRegion['polygon'] = [
  [
    [-118.5, 34.0],
    [-118.48, 34.0],
    [-118.48, 34.02],
    [-118.5, 34.02],
    [-118.5, 34.0],
  ],
];

function answer(overrides: Partial<FoodMapResponse> = {}): FoodMapResponse {
  return {
    configured: true,
    notice: null,
    attribution: { osm: true, google: true },
    regions: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        source: 'osm',
        name: 'Pico',
        polygon: ring,
        bbox: [-118.5, 34.0, -118.48, 34.02],
        progress: { done: 1, total: 2, claimed: false, claimedAt: null },
        spotsStatus: 'ready',
        spots: [
          {
            placeId: 'far',
            name: 'Saigon Herb',
            lat: 34.015,
            lng: -118.49,
            primaryType: 'vietnamese_restaurant',
            rank: 2,
            visits: 0,
            photos: [],
          },
          {
            placeId: 'near',
            name: 'Bay Street Bowls',
            lat: 34.0101,
            lng: -118.49,
            primaryType: 'salad_shop',
            rank: 1,
            visits: 1,
            photos: [],
          },
        ],
      },
    ],
    checkIns: [],
    totals: { checkIns: 6, places: 3, claimed: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  useSessionStore.setState({ userId: 'me', status: 'ready' });
  useToastStore.setState({ queue: [] });
  mapMock.mockReset();
  checkInMock.mockReset();
  photoMock.mockReset();
});

/** The spot on the card (the selected pin on the map carries the name too). */
async function cardShows(name: string) {
  await waitFor(() =>
    expect(within(screen.getByTestId('food-map-spot-card')).getByText(name)).toBeTruthy(),
  );
}

const lastToast = () => useToastStore.getState().queue.at(-1)?.message;

describe('FoodMapScreen', () => {
  it('explains before asking for location, then shows the nearest spot', async () => {
    mapMock.mockResolvedValue(answer());
    const location = fakeLocation({ status: 'undetermined' });
    await renderWithClient(<FoodMapScreen location={location} />);

    expect(await screen.findByText('See where you eat')).toBeTruthy();
    expect(mapMock).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Allow location'));

    await cardShows('Bay Street Bowls');
    expect(screen.getByText(/Salad shop · /)).toBeTruthy();
    // The map is asked for at about 100 m, never at the exact position.
    expect(mapMock).toHaveBeenCalledWith({ lat: 34.01, lng: -118.49 }, expect.anything());
    expect(screen.getByText('Glow 2')).toBeTruthy();
    expect(screen.getByText('1 to claim Pico')).toBeTruthy();
  });

  it('pages to the next spot and checks in there', async () => {
    mapMock.mockResolvedValue(answer());
    checkInMock.mockResolvedValue({
      visitsHere: 1,
      totalCheckIns: 7,
      healthy: true,
      region: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Pico',
        done: 2,
        total: 2,
        claimed: true,
      },
      claimedNow: true,
      claimedRegions: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Pico' }],
    });
    const location = fakeLocation(
      { status: 'granted' },
      { lat: 34.015, lng: -118.49, accuracyM: 8 },
    );
    await renderWithClient(<FoodMapScreen location={location} />);

    await cardShows('Saigon Herb');
    // Nearest first from where the device is: Saigon Herb is right here.
    fireEvent.press(screen.getByTestId('food-map-next'));
    await cardShows('Bay Street Bowls');
    fireEvent.press(screen.getByTestId('food-map-previous'));
    await cardShows('Saigon Herb');

    fireEvent.press(screen.getByTestId('food-map-check-in'));

    await waitFor(() =>
      expect(lastToast()).toBe('Pico claimed. Every healthy spot checked · 1 of 1'),
    );
    expect(checkInMock).toHaveBeenCalledWith({
      placeId: 'far',
      lat: 34.015,
      lng: -118.49,
      accuracyM: 8,
    });
  });

  it('says how far away the person is without sending a check-in', async () => {
    mapMock.mockResolvedValue(answer());
    const location = fakeLocation({ status: 'granted' });
    await renderWithClient(<FoodMapScreen location={location} />);

    await cardShows('Bay Street Bowls');
    fireEvent.press(screen.getByTestId('food-map-next'));
    await cardShows('Saigon Herb');
    fireEvent.press(screen.getByTestId('food-map-check-in'));

    await waitFor(() => expect(lastToast()).toMatch(/away\. Check in when you're at the place\.$/));
    expect(checkInMock).not.toHaveBeenCalled();
  });

  it('says when spot suggestions are off instead of showing an empty card', async () => {
    mapMock.mockResolvedValue(
      answer({
        configured: false,
        regions: answer().regions.map((r) => ({ ...r, spotsStatus: 'unavailable', spots: [] })),
      }),
    );
    await renderWithClient(<FoodMapScreen location={fakeLocation({ status: 'granted' })} />);

    expect(await screen.findByText('Spot suggestions are off for now')).toBeTruthy();
  });

  it('offers Settings when location is blocked', async () => {
    const location = fakeLocation({ status: 'denied', canAskAgain: false });
    await renderWithClient(<FoodMapScreen location={location} />);

    fireEvent.press(await screen.findByText('Open Settings'));
    expect(location.openSettings).toHaveBeenCalled();
  });

  it('opens Achievements with the glow level and the neighbourhoods', async () => {
    mapMock.mockResolvedValue(answer());
    await renderWithClient(<FoodMapScreen location={fakeLocation({ status: 'granted' })} />);

    await cardShows('Bay Street Bowls');
    fireEvent.press(screen.getByTestId('food-map-achievements-button'));

    expect(await screen.findByText('Glow level 2')).toBeTruthy();
    expect(screen.getByText('6 check-ins · 6 to level 3')).toBeTruthy();
    const sheet = screen.getByTestId('food-map-achievements');
    expect(within(sheet).getByLabelText('Pico, 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText(/Claim 3 regions, not earned yet, 0 of 3/)).toBeTruthy();
  });
});
