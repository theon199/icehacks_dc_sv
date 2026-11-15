import { StyleSheet, View } from 'react-native';

import { Icon, Text, radii, space, useTheme, type IconName, type Palette } from '@/ui';

/**
 * `ink` marks the person's own recipe, `highlight` a ready one, `accent` something missing or to
 * check, `danger` a conflict.
 */
export type TagTone = 'neutral' | 'ink' | 'highlight' | 'accent' | 'danger';

const TONES: Readonly<Record<TagTone, { bg: keyof Palette; fg: keyof Palette }>> = {
  neutral: { bg: 'surfaceSunken', fg: 'textMuted' },
  ink: { bg: 'primary', fg: 'onPrimary' },
  highlight: { bg: 'highlightSoft', fg: 'onHighlightSoft' },
  accent: { bg: 'warningSoft', fg: 'onWarningSoft' },
  danger: { bg: 'dangerSoft', fg: 'onDangerSoft' },
};

export interface TagProps {
  label: string;
  tone?: TagTone;
  icon?: IconName;
}

/** A small rounded status label. */
export function Tag({ label, tone = 'neutral', icon }: TagProps) {
  const theme = useTheme();
  const colors = TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: theme.colors[colors.bg] }]}>
      {icon ? <Icon name={icon} size={11} color={colors.fg} weight="semibold" /> : null}
      <Text variant="caption" color={colors.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radii.pill,
  },
});
