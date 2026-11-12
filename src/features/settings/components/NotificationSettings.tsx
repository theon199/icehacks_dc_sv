import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';
import { ListRow, toast, Toggle } from '@/ui';

import {
  fetchPushCategories,
  savePushCategories,
  selectNotificationSettings,
  syncPushRegistration,
  useSettingsStore,
  type PushCategory,
} from '../deps';
import {
  ensureNotificationPermission,
  openSystemSettings,
  type NotificationAccess,
} from '../notificationPermission';
import { rememberPushChoices, usePushChoices } from '../pushChoices';
import { refreshNotificationAccess, useNotificationAccess } from '../useNotificationAccess';
import { SettingsSection } from './SettingsSection';

type ChoiceKey = 'cookTimers' | PushCategory;

const rows: readonly { key: ChoiceKey; label: string; description: string }[] = [
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

const isPushCategory = (key: ChoiceKey): key is PushCategory =>
  key === 'social' || key === 'follows';

/** Added to a chosen alert's description while the system keeps it from arriving. */
const heldBackNote = 'You chose this alert, but it cannot arrive until notifications are allowed.';

/**
 * Notification choices. Turning one on asks for permission the first time. Cook mode timers are a
 * device setting kept in the shared settings store. Likes/comments and followers/friends are push
 * categories stored on the server, which only sends what is turned on; those switches show the
 * server's answer once it arrives and put themselves back if a change cannot be saved.
 *
 * A switch shows on only while the choice is on and the system lets Famara notify, so it never
 * claims alerts that cannot arrive; until the permission has been read once it shows the choice.
 * While the system holds alerts back, a chosen switch says so in its description, a row above the
 * switches explains how to allow them, and tapping the switch offers to allow them or to turn the
 * choice off, so a choice stays editable whatever the permission. The permission is read again
 * each time Settings comes into view or the app returns to the foreground.
 */
export function NotificationSettings() {
  const userId = useSessionStore((s) => s.userId);
  const cookTimers = useSettingsStore((s) => selectNotificationSettings(s).cookTimers);
  const setNotifications = useSettingsStore((s) => s.setNotifications);
  const push = usePushChoices(userId);
  const choices: Record<ChoiceKey, boolean> = { cookTimers, ...push };
  const access = useNotificationAccess();
  // Unknown (not read yet) counts as deliverable so switches do not flick off and back on.
  const heldBack: Exclude<NotificationAccess, 'granted'> | null =
    access === 'askable' || access === 'blocked' ? access : null;
  const anyChosen = rows.some((row) => choices[row.key]);
  const [pending, setPending] = useState<ChoiceKey | null>(null);
  // Bumped on every change so a server read that started earlier cannot overwrite it.
  const edits = useRef(0);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    const startedAt = edits.current;
    fetchPushCategories()
      .then((categories) => {
        if (active && edits.current === startedAt) rememberPushChoices(userId, categories);
      })
      .catch((error: unknown) => {
        logger.warn('Could not load push categories', describeError(error));
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const saveCategory = async (key: PushCategory, next: boolean) => {
    if (!userId) return;
    rememberPushChoices(userId, { [key]: next });
    try {
      rememberPushChoices(userId, await savePushCategories({ [key]: next }));
    } catch (error) {
      logger.warn('Could not save push category', describeError(error));
      rememberPushChoices(userId, { [key]: !next });
      toast.show({ message: 'Could not save that change. Try again.', tone: 'danger' });
      return;
    }
    if (next) {
      // Make sure this device is registered to receive what was just turned on.
      syncPushRegistration(userId).catch((error: unknown) => {
        logger.warn('Push registration after a category change failed', describeError(error));
      });
    }
  };

  const turnOff = async (key: ChoiceKey) => {
    edits.current += 1;
    if (!isPushCategory(key)) {
      setNotifications({ [key]: false });
      return;
    }
    setPending(key);
    try {
      await saveCategory(key, false);
    } finally {
      setPending(null);
    }
  };

  const turnOn = async (key: ChoiceKey) => {
    if (isPushCategory(key)) await saveCategory(key, true);
    else setNotifications({ [key]: true });
  };

  /** A chosen alert the system holds back: allow notifications, or stop choosing it. */
  const offerToStop = (key: ChoiceKey) => {
    const label = rows.find((row) => row.key === key)?.label ?? 'this alert';
    Alert.alert(
      'Notifications are off for Famara',
      `${label} is turned on, but those alerts cannot arrive until you allow notifications in the Settings app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Turn off', onPress: () => void turnOff(key) },
        { text: 'Open Settings', onPress: openSystemSettings },
      ],
    );
  };

  const change = async (key: ChoiceKey, next: boolean) => {
    if (!next) {
      await turnOff(key);
      return;
    }
    edits.current += 1;
    const alreadyChosen = choices[key];
    setPending(key);
    try {
      const outcome = await ensureNotificationPermission();
      void refreshNotificationAccess();
      if (outcome === 'granted') {
        await turnOn(key);
      } else if (alreadyChosen) {
        offerToStop(key);
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

  /** The explanation row's action: ask while the system still may, else open the Settings app. */
  const allowNotifications = async () => {
    if (heldBack === 'blocked') {
      openSystemSettings();
      return;
    }
    try {
      const outcome = await ensureNotificationPermission();
      void refreshNotificationAccess();
      if (outcome !== 'granted') {
        toast.show({
          message: 'Notifications are off for Famara in your device settings.',
          action: { label: 'Open Settings', onPress: openSystemSettings },
        });
      }
    } catch {
      toast.show({ message: 'Could not turn on notifications. Try again.', tone: 'danger' });
    }
  };

  return (
    <SettingsSection
      title="Notifications"
      footnote="You will always see activity in the in-app inbox, whatever you choose here."
    >
      {heldBack && anyChosen ? (
        <ListRow
          testID={`settings-notify-${heldBack}`}
          title={
            heldBack === 'blocked'
              ? 'Notifications are off for Famara'
              : 'Notifications are not allowed yet'
          }
          subtitle={
            heldBack === 'blocked'
              ? 'Allow them in the Settings app to get the alerts you chose.'
              : 'Allow them to get the alerts you chose.'
          }
          icon="bell.slash"
          divider
          onPress={() => void allowNotifications()}
        />
      ) : null}
      {rows.map((row) => {
        const chosen = choices[row.key];
        return (
          <Toggle
            key={row.key}
            testID={`settings-notify-${row.key}`}
            label={row.label}
            description={
              chosen && heldBack ? `${row.description} ${heldBackNote}` : row.description
            }
            value={chosen && !heldBack}
            disabled={pending === row.key}
            onValueChange={(next) => void change(row.key, next)}
          />
        );
      })}
    </SettingsSection>
  );
}
