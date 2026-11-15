import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text, fontFamily, radii, space, useTheme, type Palette } from '@/ui';

export type StatusTagTone = 'have' | 'need' | 'allIn';

export interface StatusTagProps {
  label: string;
  tone: StatusTagTone;
  testID?: string;
}

const tones: Record<StatusTagTone, { bg: keyof Palette; fg: keyof Palette }> = {
  /** Soft lime: everything is on hand. */
  have: { bg: 'highlightSoft', fg: 'onHighlightSoft' },
  /** Soft accent: something to buy first. */
  need: { bg: 'accentSoft', fg: 'onAccentSoft' },
  /** Solid lime, for laying over a photo. */
  allIn: { bg: 'highlight', fg: 'onHighlight' },
};

/**
 * A small static tag saying how much of a recipe the pantry covers. Its words are part of the
 * card's or row's label, so the tag itself stays out of the reading order.
 */
export const StatusTag = memo(function StatusTag({ label, tone, testID }: StatusTagProps) {
  const theme = useTheme();
  const { bg, fg } = tones[tone];
  return (
    <View
      style={[styles.tag, { backgroundColor: theme.colors[bg] }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...(testID ? { testID } : {})}
    >
      {tone === 'need' ? null : <Icon name="checkmark" size={12} color={fg} />}
      <Text
        variant="caption"
        color={fg}
        numberOfLines={1}
        style={styles.label}
        accessible={false}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
    gap: space.xs,
    paddingVertical: 3,
    paddingHorizontal: space.sm,
    borderRadius: radii.pill,
  },
  label: { fontFamily: fontFamily.textBold, flexShrink: 1 },
});
