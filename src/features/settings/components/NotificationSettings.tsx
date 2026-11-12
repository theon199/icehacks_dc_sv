import { useEffect, useRef, useState } from 'react';

import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';
import { toast, Toggle } from '@/ui';

import {
  fetchPushCategories,
  savePushCategories,
  syncPushRegistration,
  updateNotificationChoices,
  useNotificationChoices,
  type NotificationChoices,
  type PushCategory,
} from '../deps';
import { ensureNotificationPermission, openSystemSettings } from '../notificationPermission';
import { SettingsSection } from './SettingsSection';

const rows: readonly { key: keyof NotificationChoices; label: string; description: string }[] = [
  {
    key: 'cookTimers',
    label: 'Cook mode timers',
    description: 'An alert when a step timer finishes, even if Famara is in the background.',
  },
  {
    key: 'social',
    label: 'Likes and comments',
    description: 'When someone likes, comments on or replies to your posts.',
  },
  {
    key: 'follows',
    label: 'Followers and friends',
    description: 'When someone follows you or accepts your friend invite.',
  },
];

const isPushCategory = (key: keyof NotificationChoices): key is PushCategory =>
  key === 'social' || key === 'follows';

/**
 * Notification choices. Turning one on asks for permission the first time. Likes/comments and
 * followers/friends are push categories stored on the server, which only sends what is turned on;
 * the switches show the server's answer once it arrives and put themselves back if a change
 * cannot be saved.
 */
export function NotificationSettings() {
  const userId = useSessionStore((s) => s.userId);
  const choices = useNotificationChoices();
  const [pending, setPending] = useState<keyof NotificationChoices | null>(null);
  // Bumped on every change so a server read that started earlier cannot overwrite it.
  const edits = useRef(0);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    const startedAt = edits.current;
    fetchPushCategories()
      .then((categories) => {
        if (active && edits.current === startedAt) updateNotificationChoices(categories);
      })
      .catch((error: unknown) => {
        logger.warn('Could not load push categories', describeError(error));
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const saveCategory = async (key: PushCategory, next: boolean) => {
    updateNotificationChoices({ [key]: next });
    try {
      updateNotificationChoices(await savePushCategories({ [key]: next }));
    } catch (error) {
      logger.warn('Could not save push category', describeError(error));
      updateNotificationChoices({ [key]: !next });
      toast.show({ message: 'Could not save that change. Try again.', tone: 'danger' });
      return;
    }
    if (next && userId) {
      // Make sure this device is registered to receive what was just turned on.
      syncPushRegistration(userId).catch((error: unknown) => {
        logger.warn('Push registration after a category change failed', describeError(error));
      });
    }
  };

  const change = async (key: keyof NotificationChoices, next: boolean) => {
    edits.current += 1;
    if (!next) {
      if (!isPushCategory(key)) {
        updateNotificationChoices({ [key]: false });
        return;
      }
      setPending(key);
      try {
        await saveCategory(key, false);
      } finally {
        setPending(null);
      }
      return;
    }
    setPending(key);
    try {
      const outcome = await ensureNotificationPermission();
      if (outcome !== 'granted') {
        toast.show({
          message: 'Notifications are off for Famara in your device settings.',
          action: { label: 'Open Settings', onPress: openSystemSettings },
        });
      } else if (isPushCategory(key)) {
        await saveCategory(key, true);
      } else {
        updateNotificationChoices({ [key]: true });
      }
    } catch {
      toast.show({ message: 'Could not turn on notifications. Try again.', tone: 'danger' });
    } finally {
      setPending(null);
    }
  };

  return (
    <SettingsSection
      title="Notifications"
      footnote="You will always see activity in the in-app inbox, whatever you choose here."
    >
      {rows.map((row) => (
        <Toggle
          key={row.key}
          testID={`settings-notify-${row.key}`}
          label={row.label}
          description={row.description}
          value={choices[row.key]}
          disabled={pending === row.key}
          onValueChange={(next) => void change(row.key, next)}
        />
      ))}
    </SettingsSection>
  );
}
