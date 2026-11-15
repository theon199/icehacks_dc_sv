import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text, fontFamily, space, useTheme, type IconName } from '@/ui';

/** Side of the square picture or glyph tile at the start of a row. */
export const ROW_THUMB = 46;

export interface SearchRowProps {
  thumb: ReactNode;
  title: string;
  subtitle?: string;
  /** Extra line under the subtitle, e.g. a safety note. */
  badge?: ReactNode;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  /** A small control at the row's end (remove, more). */
  trailing?: ReactNode;
  testID?: string;
}

/** One plain, top-down row of Search: no card behind it, a hairline between rows. */
export function SearchRow({
  thumb,
  title,
  subtitle,
  badge,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  trailing,
  testID,
}: SearchRowProps) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
        {...(testID === undefined ? {} : { testID })}
      >
        {thumb}
        <View style={styles.copy}>
          <Text variant="headline" numberOfLines={1} accessible={false} style={styles.title}>
            {title}
          </Text>
          {subtitle === undefined ? null : (
            <Text variant="caption" tone="muted" numberOfLines={1} accessible={false}>
              {subtitle}
            </Text>
          )}
          {badge}
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}

/** A row for a word to search: a magnifier tile, the word and what tapping it does. */
export function TermRow({
  term,
  subtitle,
  accessibilityLabel,
  onPress,
  trailing,
  icon = 'magnifyingglass',
  testID,
}: {
  term: string;
  subtitle?: string;
  accessibilityLabel: string;
  onPress: () => void;
  trailing?: ReactNode;
  icon?: IconName;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <SearchRow
      thumb={
        <View
          style={[
            styles.glyph,
            { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.md },
          ]}
        >
          <Icon name={icon} size={18} color="textMuted" />
        </View>
      }
      title={term}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...(subtitle === undefined ? {} : { subtitle })}
      {...(trailing === undefined ? {} : { trailing })}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}

/** The small control at a row's end. */
export function RowAction({
  icon,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={space.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} color="textMuted" />
    </Pressable>
  );
}

/** A section title on the Search page, with an optional control on the right. */
export function SectionHeading({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <View style={styles.heading}>
      <Text variant="title2" accessibilityRole="header" style={styles.headingText}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  pressed: { opacity: 0.6 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fontFamily.textBold },
  glyph: { width: ROW_THUMB, height: ROW_THUMB, alignItems: 'center', justifyContent: 'center' },
  action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  headingText: { fontFamily: fontFamily.textBold },
});
