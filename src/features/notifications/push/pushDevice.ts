/**
 * Device side of push: OS permission, the Expo push token and its registration with the `push`
 * edge function. Nothing here runs at import time; the native module is touched only when one of
 * these functions is called.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { z } from 'zod';

import { callFunction } from '@/lib/api/client';
import { describeError, logger } from '@/lib/logger';

import { getPushEnabled } from '../deps';
import { needsRegistration, type PushPermission } from './pushPolicy';
import { usePushState } from './pushState';

export interface PermissionSnapshot {
  permission: PushPermission;
  canAskAgain: boolean;
}

export type RegistrationOutcome =
  'registered' | 'unchanged' | 'not_permitted' | 'disabled' | 'unsupported';

const RegisterResponse = z.object({ registered: z.boolean() });
const UnregisterResponse = z.object({ registered: z.boolean(), removed: z.number().optional() });

const ProjectIdSchema = z.string().min(1);

function easProjectId(): string | null {
  const fromConfig: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEas: unknown = Constants.easConfig?.projectId;
  const parsed = ProjectIdSchema.safeParse(fromConfig ?? fromEas);
  return parsed.success ? parsed.data : null;
}

function platformName(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
  return null;
}

function snapshot(status: Notifications.NotificationPermissionsStatus): PermissionSnapshot {
  // iOS provisional authorization delivers quietly to Notification Center; treat it as granted.
  const provisional =
    status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    status.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL;
  const permission: PushPermission =
    status.granted || provisional
      ? 'granted'
      : status.status === 'denied'
        ? 'denied'
        : 'undetermined';
  return { permission, canAskAgain: status.canAskAgain };
}

export async function readPushPermission(): Promise<PermissionSnapshot> {
  if (!platformName()) return { permission: 'denied', canAskAgain: false };
  return snapshot(await Notifications.getPermissionsAsync());
}

/** Shows the system dialog (when iOS still allows it) and returns the resulting state. */
export async function requestPushPermission(): Promise<PermissionSnapshot> {
  if (!platformName()) return { permission: 'denied', canAskAgain: false };
  return snapshot(
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    }),
  );
}

/** Android groups pushes by channel; the push function sends `social` and `account`. */
export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync('social', {
      name: 'Likes, comments and follows',
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
    Notifications.setNotificationChannelAsync('account', {
      name: 'Account and community safety',
      importance: Notifications.AndroidImportance.HIGH,
    }),
  ]);
}

/**
 * Makes sure this device is registered for `userId` when push is allowed both by the OS and by
 * Famara's own setting, and unregistered when Famara's setting is off. Cheap to call often: it
 * only reaches the server when the token, the account or the weekly refresh requires it.
 */
export async function syncPushRegistration(
  userId: string,
  options: { force?: boolean } = {},
): Promise<RegistrationOutcome> {
  const platform = platformName();
  if (!platform) return 'unsupported';
  if (!getPushEnabled()) {
    await unregisterPushDevice();
    return 'disabled';
  }
  const { permission } = await readPushPermission();
  if (permission !== 'granted') return 'not_permitted';

  const projectId = easProjectId();
  if (!projectId) {
    logger.warn('Push is not configured: no EAS project id');
    return 'unsupported';
  }

  await ensureAndroidChannels();
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const now = Date.now();
  const previous = usePushState.getState().registration;
  if (!options.force && !needsRegistration(previous, { token, userId }, now)) return 'unchanged';

  await callFunction('push', { action: 'register', token, platform }, RegisterResponse);
  usePushState.getState().setRegistration({ token, userId, at: now });
  return 'registered';
}

/**
 * Detaches this device from the signed-in account so it stops receiving pushes. Call before
 * signing out (the request needs the session) and when push is switched off.
 */
export async function unregisterPushDevice(): Promise<void> {
  const previous = usePushState.getState().registration;
  if (!previous) return;
  try {
    await callFunction('push', { action: 'unregister', token: previous.token }, UnregisterResponse);
    usePushState.getState().setRegistration(null);
  } catch (error) {
    // Kept so a later attempt can retry; the server also drops tokens the push service rejects.
    logger.warn('Could not unregister push device', describeError(error));
  }
}
