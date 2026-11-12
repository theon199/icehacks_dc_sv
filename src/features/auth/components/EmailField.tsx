import type { TextInputProps } from 'react-native';

import { TextField } from '@/ui';

import type { Field } from '../useField';

export interface EmailFieldProps {
  field: Field;
  testID: string;
  /** What the return key does: move to the next field, or submit the form. */
  returnKeyType: TextInputProps['returnKeyType'];
  onReturn: () => void;
}

/** The email input used by every account form, wired to a `useField` state. */
export function EmailField({ field, testID, returnKeyType, onReturn }: EmailFieldProps) {
  return (
    <TextField
      testID={testID}
      label="Email"
      value={field.value}
      onChangeText={field.setValue}
      onBlur={field.onBlur}
      error={field.error}
      icon="envelope.fill"
      placeholder="you@example.com"
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      textContentType="username"
      returnKeyType={returnKeyType}
      submitBehavior={returnKeyType === 'next' ? 'submit' : 'blurAndSubmit'}
      onSubmitEditing={onReturn}
    />
  );
}
