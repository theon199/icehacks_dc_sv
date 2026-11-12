import { SymbolView, type AndroidSymbol, type SFSymbol, type SymbolWeight } from 'expo-symbols';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './ThemeProvider';
import type { Palette } from './tokens';

export type IconName = SFSymbol;

export interface IconProps {
  /** SF Symbol name (iOS). */
  name: IconName;
  /** Material Symbol used on Android and web. Without it, those platforms render an empty box. */
  android?: AndroidSymbol;
  size?: number;
  color?: keyof Palette;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}

/**
 * Decorative icon. Icons are hidden from assistive technology; the control that contains one is
 * responsible for its accessible label.
 */
export function Icon({ name, android, size = 22, color = 'text', weight = 'medium', style }: IconProps) {
  const theme = useTheme();
  const box = { width: size, height: size };
  return (
    <View style={[box, style]} accessible={false} importantForAccessibility="no-hide-descendants">
      <SymbolView
        name={android ? { ios: name, android, web: android } : name}
        size={size}
        weight={weight}
        tintColor={theme.colors[color]}
        fallback={<View style={box} />}
        style={box}
      />
    </View>
  );
}
