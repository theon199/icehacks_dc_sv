import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { hasLiquidGlass } from './glass';
import { GlassControl } from './GlassControl';
import type { GlassScheme } from './GlassSurface';
import { Icon, type IconName } from './Icon';
import { HEADER_CONTROL_SIZE } from './layout';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { fontFamily, type Palette } from './tokens';

/**
 * An already formatted count for an icon button. The caller owns both strings, so this component
 * never invents a number: no badge object means no chip.
 */
export interface GlassBadge {
  /** Short visible text, e.g. "3" or "9+". */
  label: string;
  /** Appended to the button's label so a screen reader hears the count. */
  accessibilityLabel: string;
}

export interface GlassIconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  /** Diameter in points (default 44, the header control size). */
  size?: number;
  scheme?: GlassScheme;
  /** Override only over imagery, where untinted glass washes out. */
  tint?: string;
  iconColor?: keyof Palette;
  badge?: GlassBadge;
  disabled?: boolean;
  /** Marks a toggle's state for assistive technology. */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The one round glass icon control: back, close, more, share, filter, create, profile and every
 * other icon-only action in a header or on a sheet. One diameter, one glass, one press response,
 * so every circle reads as the same control.
 *
 * Without a badge the glass circle is the root, so it can sit directly in a header's
 * `GlassContainer`. A badge chip rides outside the glass (real glass clips anything that overhangs
 * it), wrapped in a frame of the same size.
 */
export function GlassIconButton({
  icon,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  size = HEADER_CONTROL_SIZE,
  scheme = 'auto',
  tint,
  iconColor = 'text',
  badge,
  disabled = false,
  selected,
  style,
  testID,
}: GlassIconButtonProps) {
  const theme = useTheme();
  const glass = hasLiquidGlass();
  const slop = size < HEADER_CONTROL_SIZE ? (HEADER_CONTROL_SIZE - size) / 2 : 8;

  const control = (
    <GlassControl
      radius={size / 2}
      onPress={onPress}
      accessibilityLabel={
        badge ? `${accessibilityLabel}, ${badge.accessibilityLabel}` : accessibilityLabel
      }
      scheme={scheme}
      disabled={disabled}
      hitSlop={slop}
      style={[
        { width: size, height: size },
        glass ? null : { borderWidth: 1, borderColor: theme.colors.controlBorder },
        badge ? null : style,
      ]}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      {...(selected === undefined ? {} : { accessibilityState: { selected } })}
      {...(tint === undefined ? {} : { tint })}
      {...(testID === undefined ? {} : { testID })}
    >
      <Icon name={icon} size={Math.round(size / 2)} color={iconColor} />
    </GlassControl>
  );

  if (!badge) return control;

  return (
    <View style={[{ width: size, height: size }, style]}>
      {control}
      {/* The count is spoken as part of the button's label, so the chip stays out of the
          reading order. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[
          styles.badge,
          { backgroundColor: theme.colors.danger, borderColor: theme.colors.background },
        ]}
        {...(testID === undefined ? {} : { testID: `${testID}-badge` })}
      >
        <Text
          variant="caption"
          color="onDanger"
          numberOfLines={1}
          maxFontSizeMultiplier={1}
          style={styles.badgeLabel}
        >
          {badge.label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: { fontFamily: fontFamily.textBold, lineHeight: 14, fontVariant: ['tabular-nums'] },
});
