import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

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
   * `tab` is the top of a tab screen: a bold title on the same row as round glass controls.
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
        <View style={styles.bar}>
          {leading ? <View style={styles.side}>{leading}</View> : null}
          <Text
            variant="title1"
            style={styles.tabTitle}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
          >
            {title}
          </Text>
          {trailing ? <View style={[styles.side, styles.trailing]}>{trailing}</View> : null}
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
  tabTitle: { flex: 1, fontSize: 30, lineHeight: 36, letterSpacing: -0.4 },
  trailing: { justifyContent: 'flex-end' },
  titles: { gap: space.xs },
});
