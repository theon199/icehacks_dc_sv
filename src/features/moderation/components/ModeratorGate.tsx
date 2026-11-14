import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, Skeleton, SkeletonGroup, useTheme } from '@/ui';
import { gutter } from '@/ui/tokens';

import { useIsModerator } from '../queries';
import { ModerationPage } from './ModerationPage';

export interface ModeratorGateProps {
  children: ReactNode;
  /**
   * Draws the page frame (back circle and heading) around the gate's own states, for a screen
   * whose content draws its frame itself once access is confirmed.
   */
  frame?: { eyebrow: string; title: string; fallbackHref: Href };
}

/**
 * Renders the review tools only for moderators. Everyone else sees a plain explanation; the data
 * behind the tools is refused by the server for them in any case. If the roles cannot be read the
 * tools stay hidden and a retry is offered instead of a misleading "no access".
 */
export function ModeratorGate({ children, frame }: ModeratorGateProps) {
  const { isModerator, isLoading, error, retry } = useIsModerator();
  if (isModerator) return <>{children}</>;
  const state = <GateState isLoading={isLoading} error={error} retry={retry} />;
  if (!frame) return state;
  return (
    <ModerationPage
      eyebrow={frame.eyebrow}
      title={frame.title}
      fallbackHref={frame.fallbackHref}
      scroll={false}
    >
      {state}
    </ModerationPage>
  );
}

function GateState({
  isLoading,
  error,
  retry,
}: Pick<ReturnType<typeof useIsModerator>, 'isLoading' | 'error' | 'retry'>) {
  const theme = useTheme();
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
  if (error) {
    return (
      <View
        style={[styles.flex, { backgroundColor: theme.colors.background }]}
        testID="moderator-gate-error"
      >
        <ErrorState error={error} title="Couldn't check your access" onRetry={retry} />
      </View>
    );
  }
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: gutter },
});
