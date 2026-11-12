/**
 * Asks for permission to send notifications the first time someone turns one on. iOS shows its
 * prompt only once; after a refusal the person has to change it in the Settings app.
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

export function openSystemSettings(): void {
  void Linking.openSettings();
}
