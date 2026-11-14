import { StyleSheet } from 'react-native';

import type { StepProps } from './types';
import { OptionList } from '../components/OptionList';
import { SectionLabel } from '../components/SectionLabel';
import { StepHeader } from '../components/StepHeader';
import { dietPatternOf, setDietPattern, toggleDiet } from '../onboardingModel';
import { dietExtraChoices, dietPatternChoices } from '../options';

export function DietStep({ draft, onChange }: StepProps) {
  return (
    <>
      <StepHeader
        title="Do you follow a way of eating?"
        description="Pick the one that fits. You can change it later."
      />
      <OptionList
        items={dietPatternChoices}
        selected={[dietPatternOf(draft)]}
        onPress={(pattern) => onChange(setDietPattern(draft, pattern))}
        testIDPrefix="diet"
        style={styles.first}
      />
      <SectionLabel>Also prefer</SectionLabel>
      <OptionList
        multi
        items={dietExtraChoices}
        selected={draft.diets}
        onPress={(id) => onChange(toggleDiet(draft, id, !draft.diets.includes(id)))}
        testIDPrefix="diet"
      />
    </>
  );
}

const styles = StyleSheet.create({ first: { marginTop: 20 } });
