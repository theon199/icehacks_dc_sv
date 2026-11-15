import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  HEADER_CONTROL_SIZE,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  TAB_HEADER_GUTTER,
  Text,
  space,
  useTheme,
} from '@/ui';

export interface ScreenTopBarProps {
  title: string;
  /** Defaults to going back one screen. */
  onBack?: () => void;
  backLabel?: string;
  /** Glass circles on the right; an empty slot of the same width keeps the title centred. */
  trailing?: ReactNode;
  testID?: string;
}

const goBack = () => router.back();

/**
 * Top bar of a pushed Community screen (a post, a cook's page): the glass back circle, a centred
 * title and room for glass actions on the right. It owns the top safe area, so the screen renders
 * without the native navigation bar.
 */
export function ScreenTopBar({
  title,
  onBack = goBack,
  backLabel = 'Back',
  trailing,
  testID = 'screen-top-bar',
}: ScreenTopBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[
        styles.bar,
        { paddingTop: insets.top + HEADER_TOP_OFFSET, backgroundColor: theme.colors.background },
      ]}
    >
      <View style={styles.side}>
        <GlassIconButton
          icon="chevron.left"
          accessibilityLabel={backLabel}
          onPress={onBack}
          testID={`${testID}-back`}
        />
      </View>
      <Text
        variant="headline"
        accessibilityRole="header"
        numberOfLines={1}
        align="center"
        maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
        style={styles.title}
      >
        {title}
      </Text>
      <View style={[styles.side, styles.trailing]}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: TAB_HEADER_GUTTER,
    paddingBottom: space.sm,
  },
  side: { minWidth: HEADER_CONTROL_SIZE, height: HEADER_CONTROL_SIZE, flexDirection: 'row' },
  trailing: { justifyContent: 'flex-end', gap: space.sm },
  title: { flex: 1 },
});
