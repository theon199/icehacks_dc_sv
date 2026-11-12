import { ChipGroup } from '../components/ChipGroup';
import { StepHeader } from '../components/StepHeader';
import { toggle } from '../onboardingModel';
import { goalChoices } from '../options';
import type { StepProps } from './types';

export function GoalsStep({ draft, onChange }: StepProps) {
  return (
    <>
      <StepHeader
        title="What are you aiming for?"
        description="Recommendations lean toward the goals you pick."
      />
      <ChipGroup
        items={goalChoices}
        selected={draft.goals}
        onToggle={(id, on) => onChange({ ...draft, goals: toggle(draft.goals, id, on) })}
        testIDPrefix="goal"
      />
    </>
  );
}
