import Svg, { G, Path, Rect } from 'react-native-svg';

import { brandColors } from '../brandColors';
import { MARK_VIEWBOX, markGeometry, markTile } from './markGeometry';

export type LogoMarkVariant = 'color' | 'tile' | 'mono';

export interface LogoMarkProps {
  size?: number;
  /**
   * `color`: basil bowl with saffron leaf on a transparent background.
   * `tile`: cream bowl on a basil rounded square (app icon look).
   * `mono`: single color, for tinting on photos or glass.
   */
  variant?: LogoMarkVariant;
  /** Fill for the `mono` variant. */
  monoColor?: string;
  /** Hide from VoiceOver when decorative next to visible "Famara" text. */
  decorative?: boolean;
}

function colorsFor(variant: LogoMarkVariant, mono: string) {
  if (variant === 'mono') return { bowl: mono, leafLarge: mono, leafSmall: mono, vein: 'none' };
  if (variant === 'tile') {
    return {
      bowl: brandColors.cream,
      leafLarge: brandColors.saffron,
      leafSmall: brandColors.basilLight,
      vein: brandColors.basilDeep,
    };
  }
  return {
    bowl: brandColors.basil,
    leafLarge: brandColors.saffron,
    leafSmall: brandColors.basilLight,
    vein: brandColors.basilDeep,
  };
}

/** The Famara mark: a bowl with two leaves growing out of it. */
export function LogoMark({
  size = 48,
  variant = 'color',
  monoColor = brandColors.basil,
  decorative = false,
}: LogoMarkProps) {
  const c = colorsFor(variant, monoColor);
  const { rim } = markGeometry;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      accessible={!decorative}
      accessibilityRole={decorative ? 'none' : 'image'}
      {...(decorative ? {} : { accessibilityLabel: 'Famara' })}
    >
      {variant === 'tile' ? (
        <Rect
          width={MARK_VIEWBOX}
          height={MARK_VIEWBOX}
          rx={markTile.radius}
          fill={brandColors.basil}
        />
      ) : null}
      <G>
        <Path d={markGeometry.leafSmall} fill={c.leafSmall} />
        <Path d={markGeometry.leafLarge} fill={c.leafLarge} />
        {c.vein === 'none' ? null : (
          <Path
            d={markGeometry.leafVein}
            stroke={c.vein}
            strokeWidth={2.2}
            strokeLinecap="round"
            fill="none"
            opacity={0.55}
          />
        )}
        <Rect x={rim.x} y={rim.y} width={rim.width} height={rim.height} rx={rim.rx} fill={c.bowl} />
        <Path d={markGeometry.bowl} fill={c.bowl} />
      </G>
    </Svg>
  );
}
