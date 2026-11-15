import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GlassControl, GlassSurface, PressableScale, hasLiquidGlass, palettes } from '@/ui';
import { withAlpha } from '@/ui/color';

const ink = palettes.light.text;
/** A light ink wash inside the clear material: enough to seat white copy without hiding the dish. */
const PHOTO_GLASS_TINT = withAlpha(ink, 0.28);
/** Without Liquid Glass there is no material, so the solid stand-in is a much denser ink. */
const PHOTO_GLASS_FALLBACK = withAlpha(ink, 0.76);

/**
 * Clear dark glass laid over the dish photo on the cook-done screens. A photo looks the same in
 * light and dark appearance, so the panel is pinned dark; without Liquid Glass it is a dense
 * translucent ink.
 */
export function PhotoGlassPanel({
  radius,
  style,
  testID,
  children,
}: {
  radius: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
}) {
  if (hasLiquidGlass()) {
    return (
      <GlassSurface
        radius={radius}
        scheme="dark"
        glassStyle="clear"
        tint={PHOTO_GLASS_TINT}
        style={style}
        {...(testID === undefined ? {} : { testID })}
      >
        {children}
      </GlassSurface>
    );
  }
  return (
    <View
      style={[{ borderRadius: radius, backgroundColor: PHOTO_GLASS_FALLBACK }, style]}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
    </View>
  );
}

/** A pressable capsule of the same dark glass. */
export function PhotoGlassButton({
  radius,
  onPress,
  accessibilityLabel,
  disabled,
  style,
  testID,
  children,
}: {
  radius: number;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
}) {
  const a11y = { accessibilityRole: 'button' as const, accessibilityLabel };
  if (hasLiquidGlass()) {
    return (
      <GlassControl
        radius={radius}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        scheme="dark"
        glassStyle="clear"
        tint={PHOTO_GLASS_TINT}
        disabled={disabled ?? false}
        style={style}
        {...(testID === undefined ? {} : { testID })}
      >
        {children}
      </GlassControl>
    );
  }
  return (
    <PressableScale
      {...a11y}
      accessibilityState={{ disabled: disabled ?? false }}
      disabled={disabled ?? false}
      onPress={onPress}
      style={[
        styles.fallback,
        { borderRadius: radius, backgroundColor: PHOTO_GLASS_FALLBACK },
        style,
        disabled ? styles.disabled : null,
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
