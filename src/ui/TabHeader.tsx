import { GlassContainer } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hasLiquidGlass } from './glass';
import {
  HEADER_CONTROL_SIZE,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  TAB_HEADER_BOTTOM_GAP,
  TAB_HEADER_GUTTER,
  TAB_HEADER_HEIGHT,
} from './layout';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { space } from './tokens';

export interface TabHeaderProps {
  title: string;
  /** Sits right after the title, before the trailing controls (Discover's mode pill). */
  leading?: ReactNode;
  /** Glass controls; the profile circle is always the last one. */
  trailing: ReactNode;
  /** Pin to the top over scrolling content, which then starts at `useTabHeaderHeight()`. */
  floating?: boolean;
  testID?: string;
}

/**
 * Total height of a tab header on this device: the safe-area top plus `TAB_HEADER_HEIGHT`. Content
 * under a floating header starts this far down.
 */
export function useTabHeaderHeight(): number {
  return useSafeAreaInsets().top + TAB_HEADER_HEIGHT;
}

/**
 * The one header for every tab root: the tab name on the left, an optional inline control after
 * it, and the glass controls on the right ending with the profile circle.
 *
 * Every number is fixed here (top = safe-area inset + `HEADER_TOP_OFFSET`, 16 pt gutters, a row
 * pinned to 44 pt, the `title1` role, `TAB_HEADER_BOTTOM_GAP` under it) so the title and the
 * profile circle sit on identical pixels on every tab and nothing jumps when the tab changes. A
 * taller leading control at a large Dynamic Type size cannot push the title off that line.
 *
 * It owns the top inset: render it without a top-edge safe area around it. The background is the
 * opaque canvas, so a screen can float it over a scroll view. There is deliberately no `style`
 * prop: a tab chooses only whether the header sits in flow or floats.
 */
export function TabHeader({
  title,
  leading,
  trailing,
  floating = false,
  testID = 'tab-header',
}: TabHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[
        styles.header,
        {
          paddingTop: insets.top + HEADER_TOP_OFFSET,
          backgroundColor: theme.colors.background,
        },
        floating && styles.floating,
      ]}
    >
      <View style={styles.row} testID={`${testID}-row`}>
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
        {leading}
        {/* One container lets neighbouring controls render as one material instead of each
            sampling the other's glass. Spacing 0 keeps them visually apart at rest. */}
        {hasLiquidGlass() ? (
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
  header: {
    paddingHorizontal: TAB_HEADER_GUTTER,
    paddingBottom: TAB_HEADER_BOTTOM_GAP,
  },
  floating: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
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
