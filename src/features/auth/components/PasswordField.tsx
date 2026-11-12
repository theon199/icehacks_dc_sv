import { useState, type Ref } from 'react';
import { StyleSheet, View, type TextInput, type TextInputProps } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale, Text, TextField } from '@/ui';

export interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** New passwords get the password manager's "suggest strong password" treatment. */
  purpose: 'current' | 'new';
  error?: string | null;
  hint?: string;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  ref?: Ref<TextInput>;
  testID?: string;
}

/** Password input with a show/hide switch underneath. */
export function PasswordField({
  label,
  value,
  onChangeText,
  purpose,
  error,
  hint,
  onBlur,
  onSubmitEditing,
  returnKeyType = 'go',
  ref,
  testID,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const isNew = purpose === 'new';
  return (
    <View style={styles.wrapper}>
      <TextField
        {...(ref ? { ref } : {})}
        {...(testID ? { testID } : {})}
        label={label}
        value={value}
        onChangeText={onChangeText}
        error={error ?? null}
        {...(hint ? { hint } : {})}
        icon="lock.fill"
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        textContentType={isNew ? 'newPassword' : 'password'}
        autoComplete={isNew ? 'new-password' : 'current-password'}
        {...(isNew ? { passwordRules: 'minlength: 8;' } : {})}
        returnKeyType={returnKeyType}
        {...(onBlur ? { onBlur } : {})}
        {...(onSubmitEditing ? { onSubmitEditing } : {})}
      />
      <PressableScale
        accessibilityRole="switch"
        accessibilityLabel="Show password"
        accessibilityState={{ checked: visible }}
        hitSlop={8}
        onPress={() => {
          haptics.selection();
          setVisible((current) => !current);
        }}
        style={styles.toggle}
      >
        <Icon name={visible ? 'eye.slash' : 'eye'} size={16} color="primary" />
        <Text variant="subhead" tone="primary" accessible={false}>
          {visible ? 'Hide password' : 'Show password'}
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 4 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 36,
  },
});
