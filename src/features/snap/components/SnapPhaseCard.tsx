import { SnapIssue } from './SnapIssue';
import { SnapProgress } from './SnapProgress';
import type { SnapPhase } from '../hooks/useSnapRequest';

const NO_FOOD_TITLES = {
  not_food: "We couldn't see any food",
  unclear: 'That photo is hard to read',
};

export interface SnapPhaseCardProps {
  phase: Exclude<SnapPhase, { status: 'idle' }>;
  /** Stops a snap in progress, or dismisses a problem, back to the camera. */
  onReset: () => void;
  /** Sends the same photo again. */
  onRetry: () => void;
}

/** A single photo being read, or why it could not be: the frozen photo with a card on top. */
export function SnapPhaseCard({ phase, onReset, onRetry }: SnapPhaseCardProps) {
  if (phase.status === 'working') {
    return (
      <SnapProgress
        photoUri={phase.photoUri}
        stage={phase.stage}
        mode={phase.mode}
        onCancel={onReset}
      />
    );
  }
  if (phase.status === 'no_food') {
    return (
      <SnapIssue
        photoUri={phase.photoUri}
        title={NO_FOOD_TITLES[phase.reason]}
        message={
          phase.mode === 'pantry'
            ? 'Try again with your food items in clear view and good light.'
            : 'Try again with the plate filling most of the frame.'
        }
        onRetake={onReset}
        onDismiss={onReset}
      />
    );
  }
  return (
    <SnapIssue
      photoUri={phase.photoUri}
      title={phase.problem.title}
      message={phase.problem.message}
      onRetry={phase.problem.canRetry ? onRetry : undefined}
      onRetake={phase.problem.canRetake ? onReset : undefined}
      onDismiss={onReset}
    />
  );
}
