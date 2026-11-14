import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import { supabase } from '@/lib/supabase/client';
import { Avatar, Icon, Text, fontFamily, gutter, useTheme, type Palette } from '@/ui';

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

const AVATAR_SIZE = 42;
const KIND_SIZE = 19;

/** The small disc on the avatar's corner: what kind of activity this is. */
const KIND_COLORS: Record<NotificationItem['kind'], { fill: keyof Palette; glyph: keyof Palette }> =
  {
    like: { fill: 'danger', glyph: 'onDanger' },
    comment: { fill: 'accent', glyph: 'onAccent' },
    reply: { fill: 'accent', glyph: 'onAccent' },
    follow: { fill: 'primary', glyph: 'onPrimary' },
    friend_accept: { fill: 'primary', glyph: 'onPrimary' },
    moderation: { fill: 'primary', glyph: 'onPrimary' },
    appeal_decision: { fill: 'primary', glyph: 'onPrimary' },
    badge: { fill: 'highlight', glyph: 'onHighlight' },
  };

function NotificationRowView({ item, onPress, now, badgeNames }: NotificationRowProps) {
  const theme = useTheme();
  const unread = item.read_at == null;
  const text = notificationText(item, badgeNames);
  const when = formatRelativeTime(item.created_at, now);
  const actorName = item.actor_display_name?.trim();
  // The sentence leads with the actor's name when there is one; that name reads in bold.
  const lead = actorName && text.startsWith(actorName) ? actorName : null;
  const rest = lead ? text.slice(lead.length) : text;
  const kind = KIND_COLORS[item.kind];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${text} ${when}`}
      accessibilityHint="Opens what this notification is about"
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.row,
        unread && { backgroundColor: theme.colors.highlightSoft },
        pressed && styles.pressed,
      ]}
      testID={`notification-${item.id}`}
    >
      {unread ? (
        <View
          style={[styles.newDot, { backgroundColor: theme.colors.success }]}
          accessible={false}
        />
      ) : null}
      <View style={styles.who}>
        {actorName ? (
          <Avatar name={actorName} uri={avatarUrl(item.actor_avatar_path)} size={AVATAR_SIZE} />
        ) : (
          <View
            style={[styles.iconWell, { backgroundColor: theme.colors.primarySoft }]}
            accessible={false}
          >
            <Icon name={iconFor(item.kind)} size={20} color="text" />
          </View>
        )}
        <View
          style={[
            styles.kind,
            { backgroundColor: theme.colors[kind.fill], borderColor: theme.colors.background },
          ]}
        >
          <Icon name={iconFor(item.kind)} size={10} color={kind.glyph} />
        </View>
      </View>
      <View style={styles.text}>
        <Text variant="subhead" tone="muted" numberOfLines={3}>
          {lead ? (
            <Text variant="subhead" style={styles.strong}>
              {lead}
            </Text>
          ) : null}
          {rest}
          <Text variant="caption" tone="muted">{`  ${when}`}</Text>
        </Text>
      </View>
    </Pressable>
  );
}

export const NotificationRow = memo(NotificationRowView);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: gutter,
    paddingVertical: 10,
  },
  pressed: { opacity: 0.7 },
  newDot: { position: 'absolute', left: 6, width: 6, height: 6, borderRadius: 3 },
  who: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  iconWell: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kind: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: KIND_SIZE,
    height: KIND_SIZE,
    borderRadius: KIND_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  strong: { fontFamily: fontFamily.textBold },
});
