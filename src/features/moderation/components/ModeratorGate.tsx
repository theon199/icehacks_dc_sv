import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState, Skeleton, SkeletonGroup, useTheme } from '@/ui';
import { gutter } from '@/ui/tokens';

import { useIsModerator } from '../queries';

export interface ModeratorGateProps {
  children: ReactNode;
}

/**
 * Renders the review tools only for moderators. Everyone else sees a plain explanation; the data
 * behind the tools is refused by the server for them in any case.
 */
export function ModeratorGate({ children }: ModeratorGateProps) {
  const theme = useTheme();
  const { isModerator, isLoading } = useIsModerator();
  if (isLoading) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        <SkeletonGroup label="Checking access" style={styles.padded}>
          <Skeleton height={44} radius="pill" />
          <Skeleton height={120} radius="md" />
        </SkeletonGroup>
      </View>
    );
  }
  if (!isModerator) {
    return (
      <View
        style={[styles.flex, { backgroundColor: theme.colors.background }]}
        testID="moderator-gate-denied"
      >
        <EmptyState
          icon="lock.shield"
          title="For moderators only"
          message="The review queue is available to Famara community moderators."
        />
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: gutter },
});
