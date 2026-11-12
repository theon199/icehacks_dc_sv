import type { StepId } from '../onboardingModel';
import { AllergenStep } from './AllergenStep';
import { AppetiteStep } from './AppetiteStep';
import { CuisineStep } from './CuisineStep';
import { DietStep } from './DietStep';
import { EffortStep } from './EffortStep';
import { GoalsStep } from './GoalsStep';
import { HouseholdStep } from './HouseholdStep';
import { NameStep } from './NameStep';
import { PantryStep } from './PantryStep';
import { TimeStep } from './TimeStep';
import type { StepProps } from './types';

/** The question for one step. */
export function StepBody({
  step,
  isTeen,
  ...props
}: StepProps & { step: StepId; isTeen: boolean }) {
  switch (step) {
    case 'name':
      return <NameStep {...props} isTeen={isTeen} />;
    case 'cuisines':
      return <CuisineStep {...props} />;
    case 'diet':
      return <DietStep {...props} />;
    case 'allergens':
      return <AllergenStep {...props} />;
    case 'goals':
      return <GoalsStep {...props} />;
    case 'time':
      return <TimeStep {...props} />;
    case 'effort':
      return <EffortStep {...props} />;
    case 'household':
      return <HouseholdStep {...props} />;
    case 'pantry':
      return <PantryStep {...props} />;
    case 'appetite':
      return <AppetiteStep {...props} />;
  }
}
