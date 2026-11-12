/**
 * Notification permission. Asks the first time someone turns a notification on; iOS shows its
 * prompt only once, and after a refusal the person has to change it in the Settings app, which
 * they can also do at any time while Famara is in the background.
 */
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

export type PermissionOutcome = 'granted' | 'denied';

export async function ensureNotificationPermission(): Promise<PermissionOutcome> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return asked.granted ? 'granted' : 'denied';
}

/**
 * Where notification permission stands: allowed, not decided yet (the app may still ask), or
 * refused, which only the Settings app can change.
 */
export type NotificationAccess = 'granted' | 'askable' | 'blocked';

/** Reads the current permission. Never throws; an unreadable answer counts as not allowed. */
export async function readNotificationAccess(): Promise<NotificationAccess> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    return current.canAskAgain ? 'askable' : 'blocked';
  } catch {
    return 'askable';
  }
}

export function openSystemSettings(): void {
  void Linking.openSettings();
}
