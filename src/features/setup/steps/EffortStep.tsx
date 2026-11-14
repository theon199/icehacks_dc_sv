import { StyleSheet } from 'react-native';

import type { StepProps } from './types';
import { OptionList } from '../components/OptionList';
import { StepHeader } from '../components/StepHeader';
import { effortChoices } from '../options';

export function EffortStep({ draft, onChange }: StepProps) {
  return (
    <>
      <StepHeader title="How much effort feels right?" />
      <OptionList
        items={effortChoices}
        selected={draft.effort == null ? [] : [draft.effort]}
        onPress={(effort) => onChange({ ...draft, effort })}
        testIDPrefix="effort"
        style={styles.list}
      />
    </>
  );
}

const styles = StyleSheet.create({ list: { marginTop: 20 } });
