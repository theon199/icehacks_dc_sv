import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import { supabase } from '@/lib/supabase/client';
import { Avatar, Icon, PressableScale, Text, useTheme } from '@/ui';
import { space } from '@/ui/tokens';

import { iconFor, notificationText, type BadgeNames } from '../describe';
import type { NotificationItem } from '../model';

export interface NotificationRowProps {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
  /** Reference time for "5 minutes ago", passed in so a whole list agrees. */
  now: number;
  badgeNames?: BadgeNames | undefined;
}

function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  try {
    return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

const AVATAR_SIZE = 44;

function NotificationRowView({ item, onPress, now, badgeNames }: NotificationRowProps) {
  const theme = useTheme();
  const unread = item.read_at == null;
  const text = notificationText(item, badgeNames);
  const when = formatRelativeTime(item.created_at, now);
  const actorName = item.actor_display_name?.trim();

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${text} ${when}`}
      accessibilityHint="Opens what this notification is about"
      pressedScale={0.99}
      pressedOpacity={0.7}
      onPress={() => onPress(item)}
      style={[styles.row, unread && { backgroundColor: theme.colors.primarySoft }]}
      testID={`notification-${item.id}`}
    >
      <View>
        {actorName ? (
          <Avatar name={actorName} uri={avatarUrl(item.actor_avatar_path)} size={AVATAR_SIZE} />
        ) : (
          <View
            style={[styles.iconWell, { backgroundColor: theme.colors.surfaceSunken }]}
            accessible={false}
          >
            <Icon name={iconFor(item.kind)} size={20} color="primary" />
          </View>
        )}
        {actorName ? (
          <View
            style={[
              styles.kindBadge,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.background },
            ]}
          >
            <Icon name={iconFor(item.kind)} size={11} color="accent" />
          </View>
        ) : null}
      </View>
      <View style={styles.text}>
        <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={3}>
          {text}
        </Text>
        <Text variant="footnote" tone="subtle">
          {when}
        </Text>
      </View>
      {unread ? (
        <View style={[styles.dot, { backgroundColor: theme.colors.accent }]} accessible={false} />
      ) : null}
    </PressableScale>
  );
}

export const NotificationRow = memo(NotificationRowView);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  iconWell: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: space.xxs },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
