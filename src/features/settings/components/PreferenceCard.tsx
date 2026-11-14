import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, fontFamily, space, useTheme } from '@/ui';

export interface PreferenceCardProps {
  title: string;
  /** Short state beside the title, e.g. "2 chosen". */
  summary?: string;
  /** Draws the summary in the highlight, for a group with something chosen. */
  summaryActive?: boolean;
  hint?: string;
  children: ReactNode;
  testID?: string;
}

/** One white card of the preferences editor: a title with its summary pill, then the choices. */
export function PreferenceCard({
  title,
  summary,
  summaryActive = false,
  hint,
  children,
  testID,
}: PreferenceCardProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.card,
          ...theme.elevation.medium,
          shadowColor: theme.colors.shadow,
        },
      ]}
    >
      <View style={styles.head}>
        <Text variant="title2" style={styles.title}>
          {title}
        </Text>
        {summary ? (
          <View
            style={[
              styles.pill,
              {
                backgroundColor: summaryActive ? theme.colors.highlight : theme.colors.primarySoft,
              },
            ]}
          >
            <Text
              variant="label"
              color={summaryActive ? 'onHighlight' : 'textMuted'}
              accessibilityLiveRegion="polite"
              style={styles.pillLabel}
            >
              {summary}
            </Text>
          </View>
        ) : null}
      </View>
      {children}
      {hint ? (
        <View style={[styles.note, { backgroundColor: theme.colors.surfaceSunken }]}>
          <Text variant="subhead" tone="muted">
            {hint}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, padding: space.xl, gap: space.xl },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  title: { flexShrink: 1, fontFamily: fontFamily.textBold, letterSpacing: -0.5 },
  pill: { borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 5 },
  pillLabel: { fontFamily: fontFamily.textBold, letterSpacing: 0.2 },
  note: { borderRadius: 20, paddingVertical: space.md, paddingHorizontal: 14 },
});
