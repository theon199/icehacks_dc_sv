import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from './ThemeProvider';
import type { Palette } from './tokens';

export interface ProgressRingProps {
  /** 0..1; values outside are clamped. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: keyof Palette;
  trackColor?: keyof Palette;
  /** Centre content, e.g. a percentage. */
  children?: ReactNode;
  /** What the ring measures, e.g. "Fit score". */
  accessibilityLabel: string;
}

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

/** Circular progress indicator drawn with SVG; exposes its value to assistive technology. */
export function ProgressRing({
  progress,
  size = 56,
  strokeWidth = 6,
  color = 'primary',
  trackColor = 'surfaceSunken',
  children,
  accessibilityLabel,
}: ProgressRingProps) {
  const theme = useTheme();
  const value = clampProgress(progress);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={theme.colors[trackColor]}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={theme.colors[color]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - value)}
          transform={`rotate(-90 ${centre} ${centre})`}
        />
      </Svg>
      {children ? (
        <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
});
