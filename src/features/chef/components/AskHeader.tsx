import { GlassContainer } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  HEADER_CONTROL_SIZE,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  TAB_HEADER_BOTTOM_GAP,
  TAB_HEADER_GUTTER,
  Text,
  hasLiquidGlass,
  space,
  useTheme,
} from '@/ui';

export interface AskHeaderProps {
  title: string;
  onBack: () => void;
  /** Spoken name of the back circle, e.g. "Back to Discover". */
  backLabel: string;
  /** Glass circles on the right. */
  trailing?: ReactNode;
  testID?: string;
}

/**
 * The header of the Ask page (Search and Chef): a glass back circle, then a large title on the
 * same pixels the tab titles use, and optional glass circles on the right. It owns the top safe
 * area.
 */
export function AskHeader({
  title,
  onBack,
  backLabel,
  trailing,
  testID = 'ask-header',
}: AskHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[
        styles.header,
        { paddingTop: insets.top + HEADER_TOP_OFFSET, backgroundColor: theme.colors.background },
      ]}
    >
      <View style={styles.row}>
        <GlassIconButton
          icon="chevron.left"
          accessibilityLabel={backLabel}
          onPress={onBack}
          testID={`${testID}-back`}
        />
        <Text
          variant="title1"
          accessibilityRole="header"
          numberOfLines={1}
          maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
          style={styles.title}
          testID={`${testID}-title`}
        >
          {title}
        </Text>
        {trailing === undefined ? null : hasLiquidGlass() ? (
          <GlassContainer spacing={0} style={styles.trailing}>
            {trailing}
          </GlassContainer>
        ) : (
          <View style={styles.trailing}>{trailing}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: TAB_HEADER_GUTTER, paddingBottom: TAB_HEADER_BOTTOM_GAP },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: HEADER_CONTROL_SIZE,
  },
  title: { flex: 1 },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: HEADER_CONTROL_SIZE,
  },
});
