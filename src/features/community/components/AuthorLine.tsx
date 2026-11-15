import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import { Avatar, PressableScale, Text, fontFamily, space } from '@/ui';

import { TeamBadge } from './TeamBadge';

export interface AuthorLineProps {
  name: string;
  handle: string;
  avatarUrl: string | null;
  isTeam: boolean;
  createdAt: string;
  onPress?: () => void;
  avatarSize?: number;
  /** Leave the time off the second line (the post header shows it at the far end instead). */
  hideTime?: boolean;
}

/** Avatar, name, team badge and "2 hours ago" at the top of a post or comment. */
export const AuthorLine = memo(function AuthorLine({
  name,
  handle,
  avatarUrl,
  isTeam,
  createdAt,
  onPress,
  avatarSize = 36,
  hideTime = false,
}: AuthorLineProps) {
  const when = formatRelativeTime(createdAt);
  const second = hideTime ? (handle ? `@${handle}` : '') : handle ? `@${handle} · ${when}` : when;
  const content = (
    <>
      <Avatar name={name} uri={avatarUrl} size={avatarSize} />
      <View style={styles.text}>
        <View style={styles.nameRow}>
          <Text variant="label" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          {isTeam ? <TeamBadge compact /> : null}
        </View>
        {second ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {second}
          </Text>
        ) : null}
      </View>
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${name}${isTeam ? ', Famara Team' : ''}, posted ${when}`}
      accessibilityHint="Opens their profile"
      pressedScale={0.99}
      pressedOpacity={0.7}
      onPress={onPress}
      style={styles.row}
    >
      {content}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, flexShrink: 1 },
  text: { flexShrink: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontFamily: fontFamily.textBold },
});
