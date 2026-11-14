import { useState, type Ref } from 'react';
import { StyleSheet, type TextInput, type TextInputProps } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale } from '@/ui';

import { AccountField, type FieldLook } from './AccountField';

export interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** New passwords get the password manager's "suggest strong password" treatment. */
  purpose: 'current' | 'new';
  error?: string | null;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  look?: FieldLook;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  ref?: Ref<TextInput>;
  testID?: string;
}

/** Password input with an eye switch inside its trailing edge. */
export function PasswordField({
  label,
  value,
  onChangeText,
  purpose,
  error,
  hint,
  placeholder,
  disabled = false,
  look = 'night',
  onBlur,
  onSubmitEditing,
  returnKeyType = 'go',
  ref,
  testID,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const isNew = purpose === 'new';
  return (
    <AccountField
      {...(ref ? { ref } : {})}
      {...(testID ? { testID } : {})}
      label={label}
      value={value}
      onChangeText={onChangeText}
      error={error ?? null}
      {...(hint ? { hint } : {})}
      {...(placeholder ? { placeholder } : {})}
      disabled={disabled}
      look={look}
      secureTextEntry={!visible}
      spellCheck={false}
      textContentType={isNew ? 'newPassword' : 'password'}
      autoComplete={isNew ? 'new-password' : 'current-password'}
      {...(isNew ? { passwordRules: 'minlength: 8;' } : {})}
      returnKeyType={returnKeyType}
      {...(onBlur ? { onBlur } : {})}
      {...(onSubmitEditing ? { onSubmitEditing } : {})}
      accessory={
        <PressableScale
          accessibilityRole="switch"
          accessibilityLabel="Show password"
          accessibilityState={{ checked: visible }}
          pressedOpacity={0.6}
          pressedScale={1}
          onPress={() => {
            haptics.selection();
            setVisible((current) => !current);
          }}
          style={styles.toggle}
        >
          <Icon name={visible ? 'eye.slash' : 'eye'} size={20} color="textMuted" />
        </PressableScale>
      }
    />
  );
}

const styles = StyleSheet.create({
  toggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
