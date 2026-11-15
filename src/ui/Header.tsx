import { GlassContainer } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { hasLiquidGlass } from './glass';
import { HEADER_CONTROL_SIZE, HEADER_TITLE_MAX_FONT_SCALE } from './layout';
import { Text } from './Text';
import { space } from './tokens';

export interface HeaderProps {
  title: string;
  /** Small uppercase line above the title, e.g. "Tonight". */
  eyebrow?: string;
  subtitle?: string;
  /** Usually a back `IconButton`. */
  leading?: ReactNode;
  /** Action buttons on the right. */
  trailing?: ReactNode;
  /**
   * `tab` is the top of a tab screen: a bold title on the same 44 pt row as round glass controls,
   * with the `TabHeader` metrics but laid out in flow (the caller owns padding and safe area).
   * `large` and `medium` stack the title under an optional control row.
   */
  size?: 'tab' | 'large' | 'medium';
  style?: StyleProp<ViewStyle>;
}

/** In-content screen heading for screens that do not use the native navigation title. */
export function Header({
  title,
  eyebrow,
  subtitle,
  leading,
  trailing,
  size = 'large',
  style,
}: HeaderProps) {
  if (size === 'tab') {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.tabRow}>
          {leading ? <View style={styles.side}>{leading}</View> : null}
          <Text
            variant="title1"
            style={styles.tabTitle}
            numberOfLines={1}
            maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
          >
            {title}
          </Text>
          {trailing ? (
            hasLiquidGlass() ? (
              <GlassContainer spacing={0} style={[styles.side, styles.trailing]}>
                {trailing}
              </GlassContainer>
            ) : (
              <View style={[styles.side, styles.trailing]}>{trailing}</View>
            )
          ) : null}
        </View>
        {subtitle ? (
          <Text variant="callout" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <View style={[styles.container, style]}>
      {leading || trailing ? (
        <View style={styles.bar}>
          <View style={styles.side}>{leading}</View>
          <View style={[styles.side, styles.trailing]}>{trailing}</View>
        </View>
      ) : null}
      <View style={styles.titles}>
        {eyebrow ? (
          <Text variant="overline" tone="accent">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant={size === 'large' ? 'title1' : 'title2'}>{title}</Text>
        {subtitle ? (
          <Text variant="callout" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: HEADER_CONTROL_SIZE,
  },
  tabTitle: { flex: 1 },
  trailing: { justifyContent: 'flex-end' },
  titles: { gap: space.xs },
});
