import { StyleSheet, View } from 'react-native';

import { Toggle, radii, space, useTheme } from '@/ui';

import type { StepProps } from './types';
import { StepHeader } from '../components/StepHeader';

export function AppetiteStep({ draft, onChange }: StepProps) {
  const theme = useTheme();
  return (
    <>
      <StepHeader
        title="Prefer smaller portions?"
        description="Small appetite mode suggests gentle dishes, half portions and lighter plans with snacks."
      />
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, shadowColor: theme.colors.shadow },
          theme.elevation.medium,
        ]}
      >
        <Toggle
          testID="small-appetite"
          label="Small appetite mode"
          description="You can change this any time in Preferences."
          value={draft.smallAppetite}
          onValueChange={(smallAppetite) => onChange({ ...draft, smallAppetite })}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radii.tile,
  },
});
