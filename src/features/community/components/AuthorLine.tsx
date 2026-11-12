import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import { Avatar, PressableScale, Text } from '@/ui';

import { TeamBadge } from './TeamBadge';

export interface AuthorLineProps {
  name: string;
  handle: string;
  avatarUrl: string | null;
  isTeam: boolean;
  createdAt: string;
  onPress?: () => void;
  avatarSize?: number;
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
}: AuthorLineProps) {
  const when = formatRelativeTime(createdAt);
  const content = (
    <>
      <Avatar name={name} uri={avatarUrl} size={avatarSize} />
      <View style={styles.text}>
        <View style={styles.nameRow}>
          <Text variant="subhead" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          {isTeam ? <TeamBadge compact /> : null}
        </View>
        <Text variant="caption" tone="subtle" numberOfLines={1}>
          {handle ? `@${handle} · ${when}` : when}
        </Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, flexShrink: 1 },
  text: { flexShrink: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1 },
});
