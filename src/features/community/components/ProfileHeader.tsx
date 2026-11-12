import { StyleSheet, View } from 'react-native';

import { formatNumber } from '@/lib/format';
import { Avatar, Button, Text, useTheme } from '@/ui';

import { TeamBadge } from './TeamBadge';
import { avatarUrl } from '../api/media';
import type { ProfileSummary } from '../api/schemas';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Text variant="headline" accessible={false}>
        {formatNumber(value, 0)}
      </Text>
      <Text variant="caption" tone="subtle" accessible={false}>
        {label}
      </Text>
    </View>
  );
}

export interface ProfileHeaderProps {
  profile: ProfileSummary;
  onToggleFollow: () => void;
  followPending: boolean;
}

/** Name, bio, counts and the follow button at the top of an author page. */
export function ProfileHeader({ profile, onToggleFollow, followPending }: ProfileHeaderProps) {
  const theme = useTheme();
  const relation = profile.is_friend ? 'Friends' : profile.follows_me ? 'Follows you' : null;
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Avatar name={profile.display_name} uri={avatarUrl(profile.avatar_path)} size={72} />
        <View style={styles.names}>
          <Text variant="title2" numberOfLines={2}>
            {profile.display_name}
          </Text>
          <Text variant="subhead" tone="subtle">
            @{profile.handle}
          </Text>
          {profile.is_team ? <TeamBadge /> : null}
        </View>
      </View>
      {profile.bio ? <Text variant="callout">{profile.bio}</Text> : null}
      <View
        style={[styles.stats, { borderColor: theme.colors.border, borderRadius: theme.radii.md }]}
      >
        <Stat value={profile.post_count} label={profile.post_count === 1 ? 'post' : 'posts'} />
        <Stat
          value={profile.follower_count}
          label={profile.follower_count === 1 ? 'follower' : 'followers'}
        />
        <Stat value={profile.following_count} label="following" />
        <Stat value={profile.likes_received} label="likes" />
      </View>
      {profile.is_self ? null : (
        <View style={styles.actions}>
          <Button
            label={profile.is_following ? 'Following' : 'Follow'}
            icon={profile.is_following ? 'checkmark' : 'plus'}
            variant={profile.is_following ? 'secondary' : 'primary'}
            onPress={onToggleFollow}
            disabled={followPending}
            {...(profile.is_following
              ? { accessibilityHint: 'Stops showing their posts in Following' }
              : {})}
            testID="follow-button"
          />
          {relation ? (
            <Text variant="footnote" tone="muted">
              {relation}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  names: { flex: 1, gap: 2 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stat: { alignItems: 'center', minWidth: 60 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
