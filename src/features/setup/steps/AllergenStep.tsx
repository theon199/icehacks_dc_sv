import type { StepProps } from './types';
import { ChipGroup, SelectChip } from '../components/ChipGroup';
import { InlineNote } from '../components/InlineNote';
import { SectionLabel } from '../components/SectionLabel';
import { StepHeader } from '../components/StepHeader';
import { setNoAllergens, toggleAllergen } from '../onboardingModel';
import { allergenChoices } from '../options';

export function AllergenStep({ draft, onChange }: StepProps) {
  return (
    <>
      <StepHeader
        title="Any food allergies?"
        description="Pick every one that applies, or tell us you have none."
      />
      <SectionLabel first>Allergies</SectionLabel>
      <ChipGroup
        leading={
          <SelectChip
            testID="allergen-none"
            label="No food allergies"
            on={draft.noAllergens}
            onToggle={(on) => onChange(setNoAllergens(draft, on))}
          />
        }
        items={allergenChoices}
        selected={draft.allergens}
        onToggle={(id, on) => onChange(toggleAllergen(draft, id, on))}
        testIDPrefix="allergen"
      />
      <InlineNote
        icon="checkmark.shield"
        title="Unconfirmed dishes never reach your deck"
        body="We leave out any recipe we can’t confirm is free of your allergens. Always check labels too."
      />
    </>
  );
}
