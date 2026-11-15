import { StyleSheet } from 'react-native';

import type { StepProps } from './types';
import { InlineNote } from '../components/InlineNote';
import { PlainField } from '../components/PlainField';
import { StepHeader } from '../components/StepHeader';

export function NameStep({ draft, onChange, onSubmit, isTeen }: StepProps & { isTeen: boolean }) {
  return (
    <>
      <StepHeader
        title="What should we call you?"
        description="Your first name or a nickname. It appears on your profile."
      />
      <PlainField
        style={styles.field}
        testID="onboarding-name"
        label="Name"
        placeholder="Your name"
        value={draft.displayName}
        onChangeText={(displayName) => onChange({ ...draft, displayName })}
        maxLength={50}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="next"
        onSubmitEditing={onSubmit}
        clearable
      />
      {isTeen ? (
        <InlineNote
          icon="info.circle"
          title="Some features are for 18 and over"
          body="Some features, like the Chef assistant, are for people 18 and over. Everything else is ready for you."
        />
      ) : null}
    </>
  );
}

export const nameStepStyles = StyleSheet.create({});

const styles = StyleSheet.create({
  field: { marginTop: 20 },
});
