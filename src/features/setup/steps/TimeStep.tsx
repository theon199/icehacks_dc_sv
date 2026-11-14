import type { StepProps } from './types';
import { SectionLabel } from '../components/SectionLabel';
import { Segmented } from '../components/Segmented';
import { StepHeader } from '../components/StepHeader';
import { timeChoices } from '../options';

const options = timeChoices.map((choice) => ({
  value: choice.minutes,
  label: choice.short,
  accessibilityLabel: choice.label,
  testID: `time-${choice.minutes ?? 'any'}`,
}));

export function TimeStep({ draft, onChange }: StepProps) {
  return (
    <>
      <StepHeader
        title="How long for a weekday meal?"
        description="We’ll favor recipes that fit in that time."
      />
      <SectionLabel first>How long on a weeknight, in minutes</SectionLabel>
      <Segmented
        accessibilityLabel="Time for a weekday meal"
        options={options}
        value={draft.timeChosen ? draft.timeBudgetMinutes : undefined}
        onChange={(minutes) => onChange({ ...draft, timeBudgetMinutes: minutes, timeChosen: true })}
      />
    </>
  );
}
