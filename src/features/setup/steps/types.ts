import type { Draft } from '../onboardingModel';

export interface StepProps {
  draft: Draft;
  onChange: (next: Draft) => void;
  /** Moves to the next question, e.g. from the keyboard's return key. */
  onSubmit: () => void;
}
