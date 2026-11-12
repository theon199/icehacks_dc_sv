import { useState } from 'react';

import { toast, Toggle } from '@/ui';

import {
  updateNotificationChoices,
  useNotificationChoices,
  type NotificationChoices,
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

/** Push notification choices. Turning one on asks for permission the first time. */
export function NotificationSettings() {
  const choices = useNotificationChoices();
  const [pending, setPending] = useState<keyof NotificationChoices | null>(null);

  const change = async (key: keyof NotificationChoices, next: boolean) => {
    if (!next) {
      updateNotificationChoices({ [key]: false });
      return;
    }
    setPending(key);
    try {
      const outcome = await ensureNotificationPermission();
      if (outcome === 'granted') {
        updateNotificationChoices({ [key]: true });
      } else {
        toast.show({
          message: 'Notifications are off for Famara in your device settings.',
          action: { label: 'Open Settings', onPress: openSystemSettings },
        });
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
