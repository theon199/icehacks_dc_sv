import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { maxFontSizeMultiplier } from './tokens';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'editable'> {
  label: string;
  /** Shown under the field; replaced by `error` when present. */
  hint?: string;
  error?: string | null;
  icon?: IconName;
  /** Adds a clear button while the field has text. */
  clearable?: boolean;
  disabled?: boolean;
  ref?: Ref<TextInput>;
}

/** Labelled text input with hint, inline error and an optional clear button. */
export function TextField({
  label,
  hint,
  error,
  icon,
  clearable = false,
  disabled = false,
  value,
  onChangeText,
  onFocus,
  onBlur,
  multiline,
  ref,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const message = error ?? hint;
  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.focus
      : theme.colors.border;

  return (
    <View style={styles.wrapper}>
      <Text variant="subhead" tone="muted" accessible={false}>
        {label}
      </Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surfaceSunken,
            borderColor,
            borderRadius: theme.radii.md,
            minHeight: multiline ? 96 : 48,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {icon ? <Icon name={icon} size={18} color="textSubtle" /> : null}
        <TextInput
          ref={ref}
          value={value}
          editable={!disabled}
          multiline={multiline}
          accessibilityLabel={label}
          {...(message ? { accessibilityHint: message } : {})}
          accessibilityState={{ disabled }}
          placeholderTextColor={theme.colors.textSubtle}
          selectionColor={theme.colors.primary}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          onChangeText={onChangeText}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            theme.typography.body,
            { color: theme.colors.text },
            multiline ? styles.multiline : null,
          ]}
          {...rest}
        />
        {clearable && value && !disabled ? (
          <IconButton
            icon="xmark.circle.fill"
            accessibilityLabel={`Clear ${label}`}
            size={28}
            color="textSubtle"
            haptic={false}
            onPress={() => onChangeText?.('')}
          />
        ) : null}
      </View>
      {message ? (
        <Text
          variant="footnote"
          tone={error ? 'danger' : 'subtle'}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 12 },
  multiline: { textAlignVertical: 'top', minHeight: 80 },
});
