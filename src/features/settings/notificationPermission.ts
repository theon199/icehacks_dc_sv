/**
 * Notification permission. Asks the first time someone turns a notification on; iOS shows its
 * prompt only once, and after a refusal the person has to change it in the Settings app, which
 * they can also do at any time while Famara is in the background.
 */
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

export type PermissionOutcome = 'granted' | 'denied';

/**
 * Whether a permission answer lets notifications arrive. iOS provisional and ephemeral
 * authorization report `granted: false`, yet notifications are still delivered (quietly to
 * Notification Center, or for an App Clip), so they count as allowed.
 */
export function permissionAllowsDelivery(
  response: Pick<Notifications.NotificationPermissionsStatus, 'granted' | 'ios'>,
): boolean {
  if (response.granted) return true;
  const ios = response.ios?.status;
  return (
    ios === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    ios === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

export async function ensureNotificationPermission(): Promise<PermissionOutcome> {
  const current = await Notifications.getPermissionsAsync();
  if (permissionAllowsDelivery(current)) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return permissionAllowsDelivery(asked) ? 'granted' : 'denied';
}

/**
 * Where notification permission stands: allowed, not decided yet (the app may still ask), or
 * refused, which only the Settings app can change.
 */
export type NotificationAccess = 'granted' | 'askable' | 'blocked';

/** Reads the current permission. Never throws; an unreadable answer counts as not decided yet. */
export async function readNotificationAccess(): Promise<NotificationAccess> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (permissionAllowsDelivery(current)) return 'granted';
    return current.canAskAgain ? 'askable' : 'blocked';
  } catch {
    return 'askable';
  }
}

export function openSystemSettings(): void {
  void Linking.openSettings();
}
