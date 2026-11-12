import type { Ref } from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from './ThemeProvider';
import { maxFontSizeMultiplier, type Palette, type TextVariant } from './tokens';

export type TextTone =
  'default' | 'muted' | 'subtle' | 'primary' | 'accent' | 'danger' | 'success' | 'inverse';

const toneColor: Record<TextTone, keyof Palette> = {
  default: 'text',
  muted: 'textMuted',
  subtle: 'textSubtle',
  primary: 'primary',
  accent: 'accent',
  danger: 'danger',
  success: 'success',
  inverse: 'textInverse',
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Overrides `tone` with an explicit palette color. */
  color?: keyof Palette;
  align?: 'left' | 'center' | 'right';
  ref?: Ref<RNText>;
}

const headingVariants = new Set<TextVariant>(['display', 'title1', 'title2', 'title3']);

/** Themed text that scales with Dynamic Type. Headings get the header role automatically. */
export function Text({
  variant = 'body',
  tone = 'default',
  color,
  align,
  style,
  accessibilityRole,
  ref,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const role = accessibilityRole ?? (headingVariants.has(variant) ? 'header' : 'text');
  return (
    <RNText
      ref={ref}
      accessibilityRole={role}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        theme.typography[variant],
        { color: theme.colors[color ?? toneColor[tone]] },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}
