import type { Ref } from 'react';
import type { TextInput, TextInputProps } from 'react-native';

import type { Field } from '../useField';
import { AccountField, type FieldLook } from './AccountField';

export interface EmailFieldProps {
  field: Field;
  testID: string;
  /** What the return key does: move to the next field, or submit the form. */
  returnKeyType: TextInputProps['returnKeyType'];
  onReturn: () => void;
  disabled?: boolean;
  look?: FieldLook;
  ref?: Ref<TextInput>;
}

/** The email input used by every account form, wired to a `useField` state. */
export function EmailField({
  field,
  testID,
  returnKeyType,
  onReturn,
  disabled = false,
  look = 'night',
  ref,
}: EmailFieldProps) {
  return (
    <AccountField
      {...(ref ? { ref } : {})}
      testID={testID}
      label="Email"
      value={field.value}
      onChangeText={field.setValue}
      onBlur={field.onBlur}
      error={field.error}
      disabled={disabled}
      look={look}
      placeholder="you@example.com"
      keyboardType="email-address"
      autoComplete="email"
      textContentType="username"
      returnKeyType={returnKeyType}
      submitBehavior={returnKeyType === 'next' ? 'submit' : 'blurAndSubmit'}
      onSubmitEditing={onReturn}
    />
  );
}
