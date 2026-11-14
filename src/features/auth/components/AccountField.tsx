import { useState, type ReactNode, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text, fontFamily, maxFontSizeMultiplier, radii, space, useTheme } from '@/ui';

import { night } from './NightTheme';

/** Height of a field's well. */
export const NIGHT_FIELD_HEIGHT = 52;
const ACCESSORY_SIZE = 44;
const FIELD_RADIUS = radii.lg - 2;

/** `night` on the dark account sheet; `page` on the light account pages. */
export type FieldLook = 'night' | 'page';

export interface AccountFieldProps extends Omit<
  TextInputProps,
  'style' | 'placeholderTextColor' | 'selectionColor' | 'keyboardAppearance' | 'editable'
> {
  label: string;
  look?: FieldLook;
  error?: string | null;
  /** Shown under the field while there is no error. */
  hint?: string;
  disabled?: boolean;
  /** Drawn inside the trailing edge, e.g. the show-password switch. */
  accessory?: ReactNode;
  ref?: Ref<TextInput>;
}

/**
 * A labelled text field for the account forms. On the night sheet it is a faint translucent well
 * with a hairline edge and a lime ring while it has focus; on a light page it is an inset well that
 * turns white with an ink ring. The ring is an overlay, so focusing never moves the layout.
 */
export function AccountField({
  label,
  look = 'night',
  error,
  hint,
  disabled = false,
  accessory,
  onFocus,
  onBlur,
  ref,
  ...inputProps
}: AccountFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const message = error ?? hint;
  const onNight = look === 'night';
  const ring = error
    ? theme.colors.danger
    : focused
      ? onNight
        ? theme.colors.highlight
        : theme.colors.text
      : null;
  const colors = onNight
    ? {
        label: night.inkMuted,
        well: night.field,
        edge: night.hairline,
        ink: night.ink,
        placeholder: night.inkFaint,
        selection: theme.colors.highlight,
      }
    : {
        label: theme.colors.textMuted,
        well: focused ? theme.colors.surface : theme.colors.surfaceSunken,
        edge: theme.colors.border,
        ink: theme.colors.text,
        placeholder: theme.colors.textMuted,
        selection: theme.colors.primary,
      };

  return (
    <View style={styles.field}>
      <Text variant="caption" style={[styles.label, { color: colors.label }]} accessible={false}>
        {label}
      </Text>
      <View
        style={[
          styles.well,
          onNight ? null : styles.pageWell,
          { backgroundColor: colors.well, borderColor: colors.edge },
          disabled ? styles.disabled : null,
        ]}
      >
        <TextInput
          ref={ref}
          autoCapitalize="none"
          autoCorrect={false}
          {...inputProps}
          accessibilityLabel={label}
          {...(message ? { accessibilityHint: message } : {})}
          accessibilityState={{ disabled }}
          editable={!disabled}
          keyboardAppearance={onNight ? 'dark' : theme.scheme}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.selection}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
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
            styles.inputFace,
            { color: colors.ink },
            accessory ? styles.inputWithAccessory : null,
          ]}
        />
        {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
        {ring ? <View pointerEvents="none" style={[styles.ring, { borderColor: ring }]} /> : null}
      </View>
      {message ? (
        <Text
          variant="footnote"
          style={[styles.hint, { color: error ? theme.colors.danger : colors.label }]}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs + 2 },
  label: {
    fontFamily: fontFamily.textSemiBold,
    marginLeft: space.xs,
  },
  well: {
    minHeight: NIGHT_FIELD_HEIGHT,
    borderRadius: FIELD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  pageWell: { minHeight: 56 },
  disabled: { opacity: 0.6 },
  input: {
    minHeight: NIGHT_FIELD_HEIGHT,
    paddingHorizontal: space.md + 2,
  },
  inputFace: { fontFamily: fontFamily.textMedium },
  inputWithAccessory: { paddingRight: ACCESSORY_SIZE + space.sm },
  accessory: {
    position: 'absolute',
    right: space.xs,
    width: ACCESSORY_SIZE,
    height: ACCESSORY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: FIELD_RADIUS,
    borderWidth: 1.5,
  },
  hint: { marginLeft: space.xs },
});
