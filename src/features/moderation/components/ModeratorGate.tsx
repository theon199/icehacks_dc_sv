import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonGroup, errorMessageFor } from '@/ui';
import { space } from '@/ui/tokens';

import { useIsModerator } from '../queries';
import { ModerationPage } from './ModerationPage';
import { ModerationStateCard } from './ModerationStateCard';

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
  if (!frame) {
    // Inside a page that lays out its own list: the state takes the page's gutter itself.
    return (
      <View style={styles.padded}>
        <GateState isLoading={isLoading} error={error} retry={retry} />
      </View>
    );
  }
  return (
    <ModerationPage eyebrow={frame.eyebrow} title={frame.title} fallbackHref={frame.fallbackHref}>
      <GateState isLoading={isLoading} error={error} retry={retry} />
    </ModerationPage>
  );
}

function GateState({
  isLoading,
  error,
  retry,
}: Pick<ReturnType<typeof useIsModerator>, 'isLoading' | 'error' | 'retry'>) {
  if (isLoading) {
    return (
      <SkeletonGroup label="Checking access">
        <Skeleton height={44} radius="pill" />
        <Skeleton height={120} radius="card" />
      </SkeletonGroup>
    );
  }
  if (error) {
    return (
      <ModerationStateCard
        alert
        testID="moderator-gate-error"
        title="Couldn't check your access"
        message={errorMessageFor(error)}
        action={{ label: 'Try again', onPress: retry }}
      />
    );
  }
  return (
    <ModerationStateCard
      testID="moderator-gate-denied"
      title="For moderators only"
      message="The review queue is available to Famara community moderators."
    />
  );
}

const styles = StyleSheet.create({
  padded: { paddingHorizontal: space.xl },
});
