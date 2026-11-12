import { ChoiceChip } from '@/ui';

import { ChipGroup } from '../components/ChipGroup';
import { FormNote } from '../components/FormNote';
import { StepHeader } from '../components/StepHeader';
import { setNoAllergens, toggleAllergen } from '../onboardingModel';
import { allergenChoices } from '../options';
import type { StepProps } from './types';

export function AllergenStep({ draft, onChange }: StepProps) {
  return (
    <>
      <StepHeader
        title="Any food allergies?"
        description="Pick every one that applies, or tell us you have none."
      />
      <ChoiceChip
        testID="allergen-none"
        label="No food allergies"
        icon="checkmark.circle"
        selected={draft.noAllergens}
        onToggle={(on) => onChange(setNoAllergens(draft, on))}
      />
      <ChipGroup
        items={allergenChoices}
        selected={draft.allergens}
        onToggle={(id, on) => onChange(toggleAllergen(draft, id, on))}
        testIDPrefix="allergen"
      />
      <FormNote
        icon="hand.raised.fill"
        message="We leave out any recipe we can’t confirm is free of your allergens. Always check labels too."
      />
    </>
  );
}
