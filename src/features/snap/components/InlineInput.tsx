import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { maxFontSizeMultiplier, minTouchTarget, radii, space, useTheme } from '@/ui';

export interface InlineInputProps extends Omit<
  TextInputProps,
  'style' | 'placeholderTextColor' | 'selectionColor'
> {
  /** Spoken label; inline inputs have no visible label of their own. */
  accessibilityLabel: string;
  width?: number;
  /** A rounded field that stands on its own, rather than a cell inside a row. */
  pill?: boolean;
}

/** Compact text input for editing values inside a list row. */
export function InlineInput({ width, pill = false, ...rest }: InlineInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.colors.textSubtle}
      selectionColor={theme.colors.primary}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        styles.input,
        theme.typography.callout,
        {
          color: theme.colors.text,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        width != null ? { width } : styles.grow,
        pill ? styles.pill : null,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: minTouchTarget,
    paddingHorizontal: space.sm,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grow: { flex: 1 },
  pill: { minHeight: 52, borderRadius: radii.pill, paddingHorizontal: space.xl, borderWidth: 0 },
});
