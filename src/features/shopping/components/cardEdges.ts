import type { ViewStyle } from 'react-native';

import { radii, space, type Palette } from '@/ui';

/**
 * Shopping sections are white cards built from consecutive list rows, so the list stays flat for
 * recycling. A row that opens a card rounds its top and leaves the gap above it; a row that closes
 * one rounds its foot and pads it.
 */
export function cardEdges(
  colors: Pick<Palette, 'surface'>,
  { opens = false, closes = false }: { opens?: boolean; closes?: boolean },
): ViewStyle {
  return {
    backgroundColor: colors.surface,
    paddingHorizontal: space.xl,
    ...(opens
      ? {
          marginTop: space.md,
          paddingTop: space.xl,
          borderTopLeftRadius: radii.card,
          borderTopRightRadius: radii.card,
        }
      : null),
    ...(closes
      ? {
          paddingBottom: space.xl,
          borderBottomLeftRadius: radii.card,
          borderBottomRightRadius: radii.card,
        }
      : null),
  };
}
