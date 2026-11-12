import {
  ensureNotificationPermission,
  permissionAllowsDelivery,
  readNotificationAccess,
} from './notificationPermission';

const mockNotifications = {
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
};
jest.mock('expo-notifications', () => ({
  IosAuthorizationStatus: { DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  getPermissionsAsync: () => mockNotifications.getPermissionsAsync(),
  requestPermissionsAsync: () => mockNotifications.requestPermissionsAsync(),
}));

/** A permission answer with an iOS authorization status. */
const iosAnswer = (status: number, canAskAgain = true) =>
  ({ granted: false, canAskAgain, ios: { status } }) as never;

beforeEach(() => {
  mockNotifications.getPermissionsAsync.mockReset();
  mockNotifications.requestPermissionsAsync.mockReset();
});

describe('permissionAllowsDelivery', () => {
  it('counts granted, provisional and ephemeral as allowed, and nothing else', () => {
    expect(permissionAllowsDelivery({ granted: true })).toBe(true);
    expect(permissionAllowsDelivery(iosAnswer(3))).toBe(true);
    expect(permissionAllowsDelivery(iosAnswer(4))).toBe(true);
    expect(permissionAllowsDelivery(iosAnswer(1))).toBe(false);
    expect(permissionAllowsDelivery({ granted: false })).toBe(false);
  });
});

describe('readNotificationAccess', () => {
  it('reports granted, askable or blocked', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({
      granted: true,
      canAskAgain: true,
    });
    await expect(readNotificationAccess()).resolves.toBe('granted');
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
    });
    await expect(readNotificationAccess()).resolves.toBe('askable');
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
    });
    await expect(readNotificationAccess()).resolves.toBe('blocked');
  });

  it('reports provisional permission as granted even when iOS will not ask again', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce(iosAnswer(3, false));
    await expect(readNotificationAccess()).resolves.toBe('granted');
  });

  it('counts an unreadable permission as not decided yet', async () => {
    mockNotifications.getPermissionsAsync.mockRejectedValueOnce(new Error('unavailable'));
    await expect(readNotificationAccess()).resolves.toBe('askable');
  });
});

describe('ensureNotificationPermission', () => {
  it('does not ask while ephemeral permission already delivers', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce(iosAnswer(4));
    await expect(ensureNotificationPermission()).resolves.toBe('granted');
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('accepts provisional permission as the answer to a request', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
    });
    mockNotifications.requestPermissionsAsync.mockResolvedValueOnce(iosAnswer(3));
    await expect(ensureNotificationPermission()).resolves.toBe('granted');
  });

  it('asks while it may, and reports a refusal', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
    });
    mockNotifications.requestPermissionsAsync.mockResolvedValueOnce({ granted: false });
    await expect(ensureNotificationPermission()).resolves.toBe('denied');
    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not ask once the system has stopped allowing it', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
    });
    await expect(ensureNotificationPermission()).resolves.toBe('denied');
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
