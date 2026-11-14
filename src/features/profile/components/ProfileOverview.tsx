import type { ReactNode } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ErrorState, Skeleton, space } from '@/ui';

import { ProfileHeader } from './ProfileHeader';
import { SectionTitle } from './SectionTitle';
import { StatsRow } from './StatsRow';
import { StreakSlab } from './StreakSlab';
import { avatarUrl } from '../api/profileApi';
import type { ProfileRow } from '../api/schemas';
import { useMyStats } from '../hooks/useProfileData';
import { useAvatarChange } from '../hooks/useProfileMutations';

export interface ProfileOverviewProps {
  profile: ProfileRow;
  onEdit: () => void;
  /** Trailing control on the "Recent dishes" row, e.g. "See all". */
  postsAction?: ReactNode;
}

/** Everything above the posts grid: the streak, who this is and the totals. */
export function ProfileOverview({ profile, onEdit, postsAction }: ProfileOverviewProps) {
  const stats = useMyStats();
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
      {stats.data ? (
        <StreakSlab stats={stats.data} />
      ) : stats.isPending ? (
        <Skeleton height={150} radius="card" />
      ) : null}
      <ProfileHeader
        profile={profile}
        avatarUri={avatarUrl(profile.avatar_path)}
        avatarBusy={avatar.isPending}
        onAvatarPress={changeAvatar}
        onEdit={onEdit}
      />
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
      <View style={styles.postsTitle}>
        <SectionTitle title="Recent dishes" trailing={postsAction} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md, paddingBottom: space.sm },
  postsTitle: { paddingTop: space.xs },
  compactError: { paddingVertical: space.md },
});
