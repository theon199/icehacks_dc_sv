import { Alert, StyleSheet, View } from 'react-native';

import { ErrorState, gutter, space } from '@/ui';

import { BadgeGrid } from './BadgeGrid';
import { ProfileHeader } from './ProfileHeader';
import { SectionTitle } from './SectionTitle';
import { StatsRow } from './StatsRow';
import { avatarUrl } from '../api/profileApi';
import type { ProfileRow } from '../api/schemas';
import { useBadgeGrid, useMyStats } from '../hooks/useProfileData';
import { useAvatarChange } from '../hooks/useProfileMutations';

export interface ProfileOverviewProps {
  profile: ProfileRow;
  onEdit: () => void;
  onFriends: () => void;
  onSettings: () => void;
}

/** Everything above the posts grid: identity, stats and badges. */
export function ProfileOverview({ profile, onEdit, onFriends, onSettings }: ProfileOverviewProps) {
  const stats = useMyStats();
  const badges = useBadgeGrid();
  const avatar = useAvatarChange();

  const changeAvatar = () => {
    Alert.alert('Profile photo', undefined, [
      { text: 'Choose a photo', onPress: () => avatar.mutate('choose') },
      ...(profile.avatar_path
        ? [
            {
              text: 'Remove photo',
              style: 'destructive' as const,
              onPress: () => avatar.mutate('remove'),
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <View style={styles.container}>
      <ProfileHeader
        profile={profile}
        avatarUri={avatarUrl(profile.avatar_path)}
        avatarBusy={avatar.isPending}
        onAvatarPress={changeAvatar}
        onEdit={onEdit}
        onFriends={onFriends}
        onSettings={onSettings}
      />

      <SectionTitle title="Your cooking" />
      {stats.error && !stats.data ? (
        <ErrorState
          error={stats.error}
          title="Stats didn't load"
          onRetry={() => void stats.refetch()}
          style={styles.compactError}
        />
      ) : (
        <StatsRow stats={stats.data} loading={stats.isPending} />
      )}

      <SectionTitle title="Badges" />
      {badges.error && badges.grid.length === 0 ? (
        <ErrorState
          error={badges.error}
          title="Badges didn't load"
          onRetry={() => void badges.refetch()}
          style={styles.compactError}
        />
      ) : (
        <BadgeGrid badges={badges.grid} loading={badges.isPending} />
      )}

      <SectionTitle title="Your posts" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.lg,
  },
  compactError: { paddingVertical: space.md },
});
