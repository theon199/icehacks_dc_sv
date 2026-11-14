import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GlassControl, GlassSurface, PressableScale, hasLiquidGlass, photoOverlay } from '@/ui';

/**
 * Clear dark glass laid over the dish photo on the cook-done screens. A photo looks the same in
 * light and dark appearance, so the panel is pinned dark; without Liquid Glass it is the photo
 * overlay's translucent ink.
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
        tint={photoOverlay.chip}
        style={style}
        {...(testID === undefined ? {} : { testID })}
      >
        {children}
      </GlassSurface>
    );
  }
  return (
    <View
      style={[{ borderRadius: radius, backgroundColor: photoOverlay.chip }, style]}
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
        tint={photoOverlay.chip}
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
        { borderRadius: radius, backgroundColor: photoOverlay.chip },
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
