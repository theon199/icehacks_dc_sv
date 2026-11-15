import Svg, { Path, Rect } from 'react-native-svg';

import { useTheme, type Palette } from '@/ui';

export interface ChefHatProps {
  size: number;
  color?: keyof Palette;
}

/**
 * Chef's mark: a filled toque. Decorative; the control around it carries the label. Drawn as a
 * vector so it needs no extra glyph font and never pops in after launch.
 */
export function ChefHat({ size, color = 'text' }: ChefHatProps) {
  const theme = useTheme();
  const fill = theme.colors[color];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        fill={fill}
        d="M6.5 14.2C3.9 13.8 2 11.6 2 9c0-2.8 2.2-5 5-5h.6C8.6 2.2 10.2 1 12 1s3.4 1.2 4.4 3h.6c2.8 0 5 2.2 5 5 0 2.6-1.9 4.8-4.5 5.2V18h-11v-3.8z"
      />
      <Rect x={6.5} y={19.4} width={11} height={3.1} rx={1.2} fill={fill} />
    </Svg>
  );
}
