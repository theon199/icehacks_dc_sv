import { Card, Toggle } from '@/ui';

import type { StepProps } from './types';
import { StepHeader } from '../components/StepHeader';

export function AppetiteStep({ draft, onChange }: StepProps) {
  return (
    <>
      <StepHeader
        title="Prefer smaller portions?"
        description="Small appetite mode suggests gentle dishes, half portions and lighter plans with snacks."
      />
      <Card variant="outlined">
        <Toggle
          testID="small-appetite"
          label="Small appetite mode"
          description="You can change this any time in Preferences."
          value={draft.smallAppetite}
          onValueChange={(smallAppetite) => onChange({ ...draft, smallAppetite })}
        />
      </Card>
    </>
  );
}
