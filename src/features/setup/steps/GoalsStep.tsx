import { StyleSheet } from 'react-native';

import { OptionList } from '../components/OptionList';
import { StepHeader } from '../components/StepHeader';
import { toggle } from '../onboardingModel';
import { goalChoices } from '../options';
import type { StepProps } from './types';

export function GoalsStep({ draft, onChange }: StepProps) {
  return (
    <>
      <StepHeader
        title="What are you aiming for?"
        description="Recommendations lean toward the goals you pick."
      />
      <OptionList
        multi
        items={goalChoices}
        selected={draft.goals}
        onPress={(id) =>
          onChange({ ...draft, goals: toggle(draft.goals, id, !draft.goals.includes(id)) })
        }
        testIDPrefix="goal"
        style={styles.list}
      />
    </>
  );
}

const styles = StyleSheet.create({ list: { marginTop: 20 } });
