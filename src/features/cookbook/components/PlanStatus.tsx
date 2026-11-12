import { router } from 'expo-router';

import { EmptyState, ErrorState, Skeleton, SkeletonGroup } from '@/ui';

import type { CandidatesState } from '../hooks/usePlanningCandidates';

export interface PlanStatusProps {
  state: Exclude<CandidatesState, { status: 'ready' }> | { status: 'empty' };
  loadingLabel: string;
}

/** Shared loading, error and "not ready yet" states of the two planner screens. */
export function PlanStatus({ state, loadingLabel }: PlanStatusProps) {
  switch (state.status) {
    case 'loading':
      return (
        <SkeletonGroup label={loadingLabel}>
          <Skeleton height={22} width="60%" />
          <Skeleton height={64} radius="md" />
          <Skeleton height={64} radius="md" />
          <Skeleton height={64} radius="md" />
        </SkeletonGroup>
      );
    case 'error':
      return <ErrorState error={state.error} onRetry={state.retry} />;
    case 'needs_safety':
      return (
        <EmptyState
          icon="checkmark.shield"
          title="Tell us about allergies first"
          message="Planning only uses recipes we know are safe for you. Answer the allergen question in Preferences to start."
          actionLabel="Open preferences"
          onAction={() => router.push('/preferences')}
        />
      );
    case 'empty':
      return (
        <EmptyState
          icon="fork.knife"
          title="Nothing to plan with yet"
          message="No recipes match your allergens and diet with the nutrition details planning needs."
        />
      );
  }
}
