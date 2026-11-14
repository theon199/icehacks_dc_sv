import { StyleSheet, View } from 'react-native';

import { ErrorState, space } from '@/ui';

import { BadgeGrid } from './BadgeGrid';
import { FriendsCard } from './FriendsCard';
import { useBadgeGrid } from '../hooks/useProfileData';

export interface ProfileExtrasProps {
  onFriends: () => void;
}

/** Everything under the posts grid: badges, then the way into Friends. */
export function ProfileExtras({ onFriends }: ProfileExtrasProps) {
  const badges = useBadgeGrid();
  return (
    <View style={styles.container}>
      {badges.error && badges.grid.length === 0 ? (
        <ErrorState
          error={badges.error}
          title="Badges didn't load"
          onRetry={badges.refetch}
          style={styles.compactError}
        />
      ) : (
        <BadgeGrid badges={badges.grid} loading={badges.isPending} />
      )}
      <FriendsCard onOpen={onFriends} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md, paddingTop: space.md },
  compactError: { paddingVertical: space.md },
});
