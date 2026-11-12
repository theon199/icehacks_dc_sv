/**
 * Local notifications for cook timers that finish while Famara is in the background. A thin
 * wrapper over expo-notifications so the timer hook can be tested with a fake.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { COOK_TIMER_NOTIFICATION_KIND } from '../logic/timerNotification';

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

export interface TimerAlert {
  title: string;
  body: string;
  seconds: number;
  /** Route to open when the notification is tapped. */
  url: string;
}

export interface TimerNotifier {
  permission(): Promise<NotificationPermission>;
  /** Asks the person; resolves to their answer (or the existing one if already decided). */
  requestPermission(): Promise<NotificationPermission>;
  /** Schedules an alert and resolves to its id. */
  schedule(alert: TimerAlert): Promise<string>;
  cancel(id: string): Promise<void>;
}

const ANDROID_CHANNEL = 'cook-timers';
let channelReady: Promise<void> | null = null;

/** Creates the Android channel once. A failed attempt is forgotten so the next timer tries again. */
export function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelReady) {
    const attempt = Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Cook timers',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400],
    }).then(
      () => undefined,
      (error: unknown) => {
        if (channelReady === attempt) channelReady = null;
        throw error;
      },
    );
    channelReady = attempt;
  }
  return channelReady;
}

function toPermission(
  response: Notifications.NotificationPermissionsStatus,
): NotificationPermission {
  if (response.granted) return 'granted';
  const ios = response.ios?.status;
  if (
    ios === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    ios === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }
  return response.status === 'undetermined' ? 'undetermined' : 'denied';
}

export const expoTimerNotifier: TimerNotifier = {
  async permission() {
    if (Platform.OS === 'web') return 'denied';
    return toPermission(await Notifications.getPermissionsAsync());
  },
  async requestPermission() {
    if (Platform.OS === 'web') return 'denied';
    const current = await Notifications.getPermissionsAsync();
    if (current.status !== 'undetermined') return toPermission(current);
    return toPermission(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      }),
    );
  },
  async schedule(alert) {
    await ensureChannel();
    return Notifications.scheduleNotificationAsync({
      content: {
        title: alert.title,
        body: alert.body,
        sound: 'default',
        data: { kind: COOK_TIMER_NOTIFICATION_KIND, url: alert.url },
        ...(Platform.OS === 'android'
          ? { priority: Notifications.AndroidNotificationPriority.HIGH }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(alert.seconds)),
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
      },
    });
  },
  async cancel(id) {
    await Notifications.cancelScheduledNotificationAsync(id);
  },
};
