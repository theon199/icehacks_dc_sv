import { ChipGroup } from '../components/ChipGroup';
import { StepHeader } from '../components/StepHeader';
import { toggleDiet } from '../onboardingModel';
import { dietChoices } from '../options';
import type { StepProps } from './types';

export function DietStep({ draft, onChange }: StepProps) {
  return (
    <>
      <StepHeader
        title="Do you follow a way of eating?"
        description="Choose any that apply, or leave it empty if you eat everything."
      />
      <ChipGroup
        items={dietChoices}
        selected={draft.diets}
        onToggle={(id, on) => onChange(toggleDiet(draft, id, on))}
        testIDPrefix="diet"
      />
    </>
  );
}
