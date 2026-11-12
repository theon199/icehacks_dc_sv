import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';

import type { HealthPlatform, HealthRequestStatus } from '@/domain/health';
import { renderWithTheme } from '@/test/render';

import { healthCopy } from '../copy';
import { healthKitSource } from '../healthKit';
import { useHealthStore } from '../healthStore';
import { refreshHealth, removeSyncedHealth } from '../refresh';
import { HealthConnections } from './HealthConnections';

jest.mock('../healthKit', () => ({
  healthKitSource: {
    platform: jest.fn(),
    requestStatus: jest.fn(),
    requestAccess: jest.fn(),
  },
}));
jest.mock('../refresh', () => ({
  refreshHealth: jest.fn(async () => 'refreshed'),
  removeSyncedHealth: jest.fn(async () => true),
}));

const source = jest.mocked(healthKitSource);
const copy = healthCopy.connection;

function device(platform: HealthPlatform, request: HealthRequestStatus) {
  source.platform.mockResolvedValue(platform);
  source.requestStatus.mockResolvedValue(request);
}

async function renderCard() {
  await renderWithTheme(<HealthConnections />);
  // Let the device probe settle.
  await act(async () => {});
}

beforeEach(() => {
  useHealthStore.getState().reset();
  source.requestAccess.mockResolvedValue(undefined);
});

describe('HealthConnections', () => {
  it('explains that Health is iPhone only on other platforms', async () => {
    device('unsupported', 'unknown');
    await renderCard();
    expect(screen.getByText(copy.states.unsupported)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: copy.connect })).not.toBeOnTheScreen();
  });

  it('says so when the device has no Health data store', async () => {
    device('unavailable', 'unknown');
    await renderCard();
    expect(screen.getByText(copy.states.unavailable)).toBeOnTheScreen();
  });

  it('connects: turns Health on, shows the permission sheet and refreshes', async () => {
    device('available', 'should_request');
    await renderCard();
    expect(screen.getByText(copy.states.off)).toBeOnTheScreen();

    source.requestStatus.mockResolvedValue('answered');
    await userEvent.setup().press(screen.getByRole('button', { name: copy.connect }));

    expect(source.requestAccess).toHaveBeenCalledTimes(1);
    expect(useHealthStore.getState().enabled).toBe(true);
    expect(refreshHealth).toHaveBeenCalledWith({ force: true });
    expect(screen.getByText(copy.states.connected)).toBeOnTheScreen();
    expect(screen.getByLabelText(copy.sync)).toBeOnTheScreen();
  });

  it('asks again when Health is on but the sheet was never answered', async () => {
    device('available', 'should_request');
    useHealthStore.getState().setEnabled(true);
    await renderCard();
    expect(screen.getByText(copy.states.needs_permission)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.allow })).toBeOnTheScreen();
  });

  it('stays usable and reports an error when the permission request fails', async () => {
    device('available', 'should_request');
    source.requestAccess.mockRejectedValue(new Error('boom'));
    await renderCard();
    await userEvent.setup().press(screen.getByRole('button', { name: copy.connect }));
    expect(refreshHealth).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: copy.allow })).toBeEnabled();
  });

  it('turns sync on and off, removing synced summaries when turned off', async () => {
    device('available', 'answered');
    useHealthStore.getState().setEnabled(true);
    await renderCard();
    await fireEvent(screen.getByLabelText(copy.sync), 'valueChange', true);
    expect(useHealthStore.getState().syncEnabled).toBe(true);
    expect(refreshHealth).toHaveBeenCalledWith({ force: true });

    await fireEvent(screen.getByLabelText(copy.sync), 'valueChange', false);
    expect(useHealthStore.getState().syncEnabled).toBe(false);
    expect(removeSyncedHealth).toHaveBeenCalledTimes(1);
  });

  it('disconnects and clears local health data', async () => {
    device('available', 'answered');
    useHealthStore.getState().setEnabled(true);
    useHealthStore.getState().setSyncEnabled(true);
    await renderCard();
    await userEvent.setup().press(screen.getByRole('button', { name: copy.disconnect }));
    expect(useHealthStore.getState()).toMatchObject({ enabled: false, syncEnabled: false });
    expect(removeSyncedHealth).toHaveBeenCalledTimes(1);
    expect(screen.getByText(copy.states.off)).toBeOnTheScreen();
  });
});
