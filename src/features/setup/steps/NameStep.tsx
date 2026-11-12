import { TextField } from '@/ui';

import type { StepProps } from './types';
import { FormNote } from '../components/FormNote';
import { StepHeader } from '../components/StepHeader';

export function NameStep({ draft, onChange, onSubmit, isTeen }: StepProps & { isTeen: boolean }) {
  return (
    <>
      <StepHeader
        title="What should we call you?"
        description="Your first name or a nickname. It appears on your profile."
      />
      <TextField
        testID="onboarding-name"
        label="Name"
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
        <FormNote message="Some features, like the Chef assistant, are for people 18 and over. Everything else is ready for you." />
      ) : null}
    </>
  );
}
