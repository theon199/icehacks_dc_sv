import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useNearbyLocation } from './useNearbyLocation';
import type { PermissionSnapshot } from '../model/permission';
import type { LocationService } from '../services/location';

const here = { latitude: 51.5, longitude: -0.12 };

function fakeService(overrides: Partial<LocationService> = {}): jest.Mocked<LocationService> {
  const permission: PermissionSnapshot = { status: 'undetermined', canAskAgain: true };
  return {
    getPermission: jest.fn(async () => permission),
    requestPermission: jest.fn(async () => ({ status: 'granted', canAskAgain: true }) as const),
    currentPosition: jest.fn(async () => here),
    findCity: jest.fn(async () => ({
      point: { latitude: 30.27, longitude: -97.74 },
      label: 'Austin',
    })),
    openSettings: jest.fn(async () => undefined),
    ...overrides,
  } as jest.Mocked<LocationService>;
}

describe('useNearbyLocation', () => {
  it('explains first and only asks when the person agrees', async () => {
    const service = fakeService();
    const { result } = await renderHook(() => useNearbyLocation(service));
    await waitFor(() => expect(result.current.state.step).toBe('explain'));
    expect(service.requestPermission).not.toHaveBeenCalled();

    await act(() => result.current.requestPermission());
    await waitFor(() => expect(result.current.state.step).toBe('located'));
    expect(service.requestPermission).toHaveBeenCalledTimes(1);
    expect(result.current.origin).toEqual({ point: here, source: 'device', label: null });
  });

  it('uses the device location straight away when access was given before', async () => {
    const service = fakeService({
      getPermission: jest.fn(async () => ({ status: 'granted', canAskAgain: true }) as const),
    });
    const { result } = await renderHook(() => useNearbyLocation(service));
    await waitFor(() => expect(result.current.origin?.source).toBe('device'));
    expect(service.requestPermission).not.toHaveBeenCalled();
  });

  it('offers Settings and the city search once access is refused for good', async () => {
    const service = fakeService({
      getPermission: jest.fn(async () => ({ status: 'denied', canAskAgain: false }) as const),
    });
    const { result } = await renderHook(() => useNearbyLocation(service));
    await waitFor(() => expect(result.current.state.step).toBe('blocked'));

    await act(() => result.current.openSettings());
    expect(service.openSettings).toHaveBeenCalled();

    await act(() => result.current.chooseCity());
    expect(result.current.state).toEqual({ step: 'manual', origin: null, reason: 'blocked' });
    await act(() => result.current.searchCity('Austin'));
    expect(result.current.origin).toEqual({
      point: { latitude: 30.27, longitude: -97.74 },
      source: 'city',
      label: 'Austin',
    });
  });

  it('reports a city that cannot be found', async () => {
    const service = fakeService({ findCity: jest.fn(async () => null) });
    const { result } = await renderHook(() => useNearbyLocation(service));
    await act(() => result.current.chooseCity());
    await act(() => result.current.searchCity('Nowhere'));
    expect(result.current.citySearch).toBe('notFound');
    expect(result.current.origin).toBeNull();
  });

  it('reports a failed city lookup separately from no match', async () => {
    const service = fakeService({
      findCity: jest.fn(async () => {
        throw new Error('offline');
      }),
    });
    const { result } = await renderHook(() => useNearbyLocation(service));
    await act(() => result.current.chooseCity());
    await act(() => result.current.searchCity('Austin'));
    expect(result.current.citySearch).toBe('failed');
  });

  it('drops a city lookup that finishes after the search was left', async () => {
    let finish: (match: { point: typeof here; label: string }) => void = () => undefined;
    const service = fakeService({
      getPermission: jest.fn(async () => ({ status: 'granted', canAskAgain: true }) as const),
      findCity: jest.fn(
        () =>
          new Promise<{ point: typeof here; label: string } | null>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    const { result } = await renderHook(() => useNearbyLocation(service));
    await waitFor(() => expect(result.current.state.step).toBe('located'));

    await act(() => result.current.chooseCity());
    let pending: Promise<void> = Promise.resolve();
    await act(() => {
      pending = result.current.searchCity('Austin');
    });
    expect(result.current.citySearch).toBe('searching');
    await act(() => result.current.cancelCity());
    await act(async () => {
      finish({ point: { latitude: 30.27, longitude: -97.74 }, label: 'Austin' });
      await pending;
    });

    expect(result.current.origin).toEqual({ point: here, source: 'device', label: null });
    expect(result.current.citySearch).toBe('idle');
  });

  it('keeps only the latest of two overlapping city lookups', async () => {
    const finishers: ((match: { point: typeof here; label: string }) => void)[] = [];
    const service = fakeService({
      findCity: jest.fn(
        () =>
          new Promise<{ point: typeof here; label: string } | null>((resolve) => {
            finishers.push(resolve);
          }),
      ),
    });
    const { result } = await renderHook(() => useNearbyLocation(service));
    await act(() => result.current.chooseCity());
    const lookups: Promise<void>[] = [];
    await act(() => {
      lookups.push(result.current.searchCity('Austin'));
      lookups.push(result.current.searchCity('Boston'));
    });
    await act(async () => {
      finishers[1]?.({ point: here, label: 'Boston' });
      finishers[0]?.({ point: { latitude: 30.27, longitude: -97.74 }, label: 'Austin' });
      await Promise.all(lookups);
    });
    expect(result.current.origin?.label).toBe('Boston');
  });

  it('falls back when no position can be found', async () => {
    const service = fakeService({
      getPermission: jest.fn(async () => ({ status: 'granted', canAskAgain: true }) as const),
      currentPosition: jest.fn(async () => {
        throw new Error('timeout');
      }),
    });
    const { result } = await renderHook(() => useNearbyLocation(service));
    await waitFor(() => expect(result.current.state.step).toBe('unavailable'));
  });

  it('asks rather than assuming a refusal when the permission check fails', async () => {
    const service = fakeService({
      getPermission: jest.fn(async () => {
        throw new Error('native failure');
      }),
    });
    const { result } = await renderHook(() => useNearbyLocation(service));
    await waitFor(() => expect(result.current.state.step).toBe('explain'));
  });
});
