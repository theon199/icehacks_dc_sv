import type { Ref } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import {
  Icon,
  IconButton,
  maxFontSizeMultiplier,
  radii,
  space,
  useTheme,
  type IconName,
} from '@/ui';

export interface PlainFieldProps extends Omit<TextInputProps, 'style'> {
  /** Read by VoiceOver; the question above the field is the visible label. */
  label: string;
  icon?: IconName;
  /** Adds a clear button while the field has text. */
  clearable?: boolean;
  /** Placement of the field's well, e.g. its top margin. */
  style?: StyleProp<ViewStyle>;
  ref?: Ref<TextInput>;
}

/** A white answer field with a hairline edge, as tall as the answer rows. */
export function PlainField({
  label,
  icon,
  clearable = false,
  value,
  onChangeText,
  style,
  ref,
  ...rest
}: PlainFieldProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          shadowColor: theme.colors.shadow,
        },
        theme.elevation.low,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color="textMuted" /> : null}
      <TextInput
        ref={ref}
        value={value}
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textMuted}
        selectionColor={theme.colors.primary}
        keyboardAppearance={theme.scheme}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        {...(onChangeText ? { onChangeText } : {})}
        style={[styles.input, theme.typography.title3, { color: theme.colors.text }]}
        {...rest}
      />
      {clearable && value ? (
        <IconButton
          icon="xmark.circle.fill"
          accessibilityLabel={`Clear ${label}`}
          size={28}
          color="textMuted"
          haptic={false}
          onPress={() => onChangeText?.('')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  input: { flex: 1, minWidth: 0, paddingVertical: 0 },
});
