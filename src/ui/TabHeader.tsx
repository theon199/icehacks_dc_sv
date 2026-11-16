import { BlurView } from 'expo-blur';
import { GlassContainer } from 'expo-glass-effect';
import type { ReactNode, RefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { withAlpha } from './color';
import { hasLiquidGlass } from './glass';
import { Icon } from './Icon';
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
import { radii, space } from './tokens';

/** Makes the title a button that opens a menu, drawn with a chevron after it. */
export interface TabHeaderTitleMenu {
  onPress: () => void;
  expanded: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/** How much of the canvas a frosted header keeps over a map. */
const FROST_ALPHA = 0.74;
const CHEVRON_SIZE = 30;

export interface TabHeaderProps {
  title: string;
  /** Sits right after the title, before the trailing controls (Discover's mode pill). */
  leading?: ReactNode;
  /** Glass controls; the profile circle is always the last one. */
  trailing: ReactNode;
  /** Pin to the top over scrolling content, which then starts at `useTabHeaderHeight()`. */
  floating?: boolean;
  /** The title opens a menu (Community's Feed and Food map). */
  titleMenu?: TabHeaderTitleMenu;
  /** The title menu's trigger ref (`useGlassMenu().triggerRef`), so it opens under the title. */
  titleMenuRef?: RefObject<View | null>;
  /** A row under the title row, inside the header's surface (the food map's stats). */
  below?: ReactNode;
  /**
   * `frost` blurs what is behind a floating header (a map) instead of covering it with the opaque
   * canvas.
   */
  surface?: 'canvas' | 'frost';
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
  titleMenu,
  titleMenuRef,
  below,
  surface = 'canvas',
  testID = 'tab-header',
}: TabHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const frost = surface === 'frost';
  const titleText = (
    <Text
      variant="title1"
      accessibilityRole="header"
      numberOfLines={1}
      maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
      style={titleMenu ? styles.titleInMenu : styles.title}
      testID={`${testID}-title`}
    >
      {title}
    </Text>
  );
  return (
    <View
      testID={testID}
      style={[
        styles.header,
        {
          paddingTop: insets.top + HEADER_TOP_OFFSET,
          backgroundColor: frost
            ? withAlpha(theme.colors.background, FROST_ALPHA)
            : theme.colors.background,
        },
        frost && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
        floating && styles.floating,
      ]}
    >
      {frost ? (
        <BlurView
          intensity={40}
          tint={theme.scheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={styles.row} testID={`${testID}-row`}>
        {titleMenu ? (
          <View style={styles.title}>
            <View ref={titleMenuRef} collapsable={false} style={styles.titleTrigger}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={title}
                accessibilityState={{ expanded: titleMenu.expanded }}
                onPress={titleMenu.onPress}
                hitSlop={space.sm}
                style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}
                {...(titleMenu.accessibilityHint === undefined
                  ? {}
                  : { accessibilityHint: titleMenu.accessibilityHint })}
                {...(titleMenu.testID === undefined ? {} : { testID: titleMenu.testID })}
              >
                {titleText}
                <View style={[styles.chevron, { backgroundColor: theme.colors.hairline }]}>
                  <Icon name={titleMenu.expanded ? 'chevron.up' : 'chevron.down'} size={17} />
                </View>
              </Pressable>
            </View>
          </View>
        ) : (
          titleText
        )}
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
      {below}
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
  titleInMenu: { flexShrink: 1 },
  titleTrigger: { alignSelf: 'flex-start', maxWidth: '100%' },
  titleButton: { flexDirection: 'row', alignItems: 'center', gap: space.xs + space.xxs },
  pressed: { opacity: 0.6 },
  chevron: {
    width: CHEVRON_SIZE,
    height: CHEVRON_SIZE,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: HEADER_CONTROL_SIZE,
  },
});
