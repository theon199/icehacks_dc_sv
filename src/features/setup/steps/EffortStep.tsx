import { StyleSheet, View } from 'react-native';

import { OptionCard } from '../components/OptionCard';
import { StepHeader } from '../components/StepHeader';
import { effortChoices } from '../options';
import type { StepProps } from './types';

export function EffortStep({ draft, onChange }: StepProps) {
  return (
    <>
      <StepHeader title="How much effort feels right?" />
      <View style={styles.list} accessibilityRole="radiogroup">
        {effortChoices.map((choice) => (
          <OptionCard
            key={choice.id}
            testID={`effort-${choice.id}`}
            label={choice.label}
            {...(choice.description ? { description: choice.description } : {})}
            {...(choice.icon ? { icon: choice.icon } : {})}
            selected={draft.effort === choice.id}
            onSelect={() => onChange({ ...draft, effort: choice.id })}
          />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
});
