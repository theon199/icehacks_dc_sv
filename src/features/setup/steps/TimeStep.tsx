import { StyleSheet, View } from 'react-native';

import { OptionCard } from '../components/OptionCard';
import { StepHeader } from '../components/StepHeader';
import { timeChoices } from '../options';
import type { StepProps } from './types';

export function TimeStep({ draft, onChange }: StepProps) {
  return (
    <>
      <StepHeader
        title="How long for a weekday meal?"
        description="We’ll favor recipes that fit in that time."
      />
      <View style={styles.list} accessibilityRole="radiogroup">
        {timeChoices.map((choice) => (
          <OptionCard
            key={choice.label}
            testID={`time-${choice.minutes ?? 'any'}`}
            label={choice.label}
            icon="clock"
            selected={draft.timeChosen && draft.maxMinutes === choice.minutes}
            onSelect={() => onChange({ ...draft, maxMinutes: choice.minutes, timeChosen: true })}
          />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
});
