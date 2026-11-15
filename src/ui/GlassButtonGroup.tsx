import { GlassView } from 'expo-glass-effect';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { hasLiquidGlass } from './glass';
import { Icon, type IconName } from './Icon';
import { HEADER_CONTROL_SIZE } from './layout';
import { useTheme } from './ThemeProvider';

export interface GlassButtonGroupItem {
  icon: IconName;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  testID?: string;
}

export interface GlassButtonGroupProps {
  items: readonly GlassButtonGroupItem[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Glyph size inside a grouped capsule; a touch under the lone circle's so the pair reads even. */
const GROUP_GLYPH = 21;

/**
 * Two or three related icon actions sharing one glass capsule, the iOS 26 toolbar grouping. Each
 * action keeps its own 44 pt target, label and test ID, so a screen reader and a test reach it on
 * its own.
 *
 * On real glass the capsule is interactive, so the material answers a press; the pressed item's
 * glyph also dims so the touched action is clear inside the shared capsule.
 */
export function GlassButtonGroup({ items, style, testID }: GlassButtonGroupProps) {
  const theme = useTheme();
  const buttons = items.map((item) => (
    <Pressable
      key={item.accessibilityLabel}
      accessibilityRole="button"
      accessibilityLabel={item.accessibilityLabel}
      onPress={item.onPress}
      style={styles.item}
      {...(item.accessibilityHint === undefined
        ? {}
        : { accessibilityHint: item.accessibilityHint })}
      {...(item.testID === undefined ? {} : { testID: item.testID })}
    >
      {({ pressed }) => (
        <Icon name={item.icon} size={GROUP_GLYPH} style={pressed ? styles.pressed : undefined} />
      )}
    </Pressable>
  ));

  if (hasLiquidGlass()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        style={[styles.capsule, style]}
        {...(testID === undefined ? {} : { testID })}
      >
        {buttons}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.capsule,
        {
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.controlBorder,
          ...theme.elevation.low,
          shadowColor: theme.colors.shadow,
        },
        style,
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      {buttons}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_CONTROL_SIZE,
    borderRadius: HEADER_CONTROL_SIZE / 2,
  },
  item: {
    width: HEADER_CONTROL_SIZE,
    height: HEADER_CONTROL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.45 },
});
