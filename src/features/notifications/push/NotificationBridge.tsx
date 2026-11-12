/**
 * App-wide notification plumbing for a signed-in session. Renders nothing; mount it once inside
 * the signed-in layout. It:
 *
 * - shows pushes that arrive while Famara is open as banners and refreshes the inbox and badge;
 * - opens the right screen when a push is tapped, including the one that launched the app;
 * - keeps this device's push registration in step with the OS permission and the push setting;
 * - listens for new inbox rows over realtime so the bell updates without a push;
 * - mirrors the unread count on the app icon.
 */
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase/client';

import { markNotificationsRead } from '../api';
import { usePushEnabled } from '../deps';
import { invalidateInbox, useUnreadCount } from '../queries';
import { syncPushRegistration } from './pushDevice';
import { resolvePushTap } from './routing';

/** Response ids already acted on, so the launch response and its listener event route once. */
const handledResponses = new Set<string>();

function responseKey(response: Notifications.NotificationResponse): string {
  return `${response.notification.request.identifier}:${response.actionIdentifier}`;
}

export function NotificationBridge() {
  const userId = useSessionStore((s) => (s.status === 'ready' ? s.userId : null));
  const pushEnabled = usePushEnabled();
  const unread = useUnreadCount();
  const client = useQueryClient();
  const router = useRouter();

  // Foreground presentation and inbox refresh on arrival.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
    const received = Notifications.addNotificationReceivedListener(() => {
      void invalidateInbox(client);
    });
    return () => {
      received.remove();
      Notifications.setNotificationHandler(null);
    };
  }, [client]);

  // Tap routing.
  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return undefined;
    const open = (response: Notifications.NotificationResponse) => {
      const key = responseKey(response);
      if (handledResponses.has(key)) return;
      handledResponses.add(key);
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const tap = resolvePushTap(response.notification.request.content.data, userId);
      if (tap.notificationId) {
        markNotificationsRead([tap.notificationId])
          .then(() => invalidateInbox(client))
          .catch((error: unknown) => logger.warn('Could not mark push read', describeError(error)));
      }
      router.push(tap.href);
    };
    const launch = Notifications.getLastNotificationResponse();
    if (launch) {
      open(launch);
      Notifications.clearLastNotificationResponse();
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [client, router, userId]);

  // Registration: on sign-in, when the setting changes, when the app returns to the foreground and
  // when the OS rotates the device token.
  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return undefined;
    const sync = (force = false) => {
      syncPushRegistration(userId, { force }).catch((error: unknown) =>
        logger.warn('Push registration failed', describeError(error)),
      );
    };
    sync();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    const tokens = Notifications.addPushTokenListener(() => sync(true));
    return () => {
      appState.remove();
      tokens.remove();
    };
  }, [userId, pushEnabled]);

  // Realtime: new inbox rows refresh the bell even without a push.
  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void invalidateInbox(client);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, userId]);

  // App icon badge.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.setBadgeCountAsync(userId ? unread : 0).catch(() => undefined);
  }, [unread, userId]);

  return null;
}
