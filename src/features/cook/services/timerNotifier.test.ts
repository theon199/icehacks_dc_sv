import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ensureChannel } from './timerNotifier';

jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));

describe('ensureChannel', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tries again after a failed channel setup, then remembers success', async () => {
    const setup = jest.mocked(Notifications.setNotificationChannelAsync);
    setup.mockRejectedValueOnce(new Error('busy')).mockResolvedValue(null);

    await expect(ensureChannel()).rejects.toThrow('busy');
    await expect(ensureChannel()).resolves.toBeUndefined();
    await expect(ensureChannel()).resolves.toBeUndefined();

    expect(setup).toHaveBeenCalledTimes(2);
  });

  it('needs no channel on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const setup = jest.mocked(Notifications.setNotificationChannelAsync);
    setup.mockClear();
    await expect(ensureChannel()).resolves.toBeUndefined();
    expect(setup).not.toHaveBeenCalled();
  });
});
