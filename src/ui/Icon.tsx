import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView, type AndroidSymbol, type SFSymbol, type SymbolWeight } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ioniconFor } from './iconMap';
import { useTheme } from './ThemeProvider';
import type { Palette } from './tokens';

export type IconName = SFSymbol;

export interface IconProps {
  /** SF Symbol name. Names in `iconMap` draw their Ionicons glyph; others draw the SF Symbol. */
  name: IconName;
  /** Material Symbol for an unmapped name on Android and web. */
  android?: AndroidSymbol;
  size?: number;
  color?: keyof Palette;
  /** Stroke weight for an unmapped SF Symbol; mapped glyphs have one weight. */
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}

/**
 * Decorative icon. Icons are hidden from assistive technology; the control that contains one is
 * responsible for its accessible label.
 */
export function Icon({
  name,
  android,
  size = 22,
  color = 'text',
  weight = 'medium',
  style,
}: IconProps) {
  const theme = useTheme();
  const box = { width: size, height: size };
  const tint = theme.colors[color];
  const glyph = ioniconFor(name);
  return (
    <View
      style={[box, styles.center, style]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {glyph ? (
        <Ionicons name={glyph} size={size} color={tint} />
      ) : (
        <SymbolView
          name={android ? { ios: name, android, web: android } : name}
          size={size}
          weight={weight}
          tintColor={tint}
          fallback={<View style={box} />}
          style={box}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
