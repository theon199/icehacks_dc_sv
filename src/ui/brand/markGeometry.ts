/**
 * Geometry of the Famara mark: a bowl with two leaves sprouting from it. Plain data with no imports
 * so both the React component and `tools/brand/generate.mjs` draw from the same source.
 */
export const MARK_VIEWBOX = 120;

export const markGeometry = {
  /** Bowl body: lower half-disc below the rim. */
  bowl: 'M20 62 H100 A40 40 0 0 1 20 62 Z',
  /** Rim of the bowl. */
  rim: { x: 14, y: 54, width: 92, height: 9, rx: 4.5 },
  /** Large leaf leaning right. */
  leafLarge: 'M61 53 C58 33 70 18 94 13 C93 35 82 50 61 53 Z',
  /** Vein of the large leaf. */
  leafVein: 'M63 50 C70 38 78 28 88 19',
  /** Small leaf leaning left. */
  leafSmall: 'M57 53 C45 48 33 39 28 25 C44 25 56 36 57 53 Z',
} as const;

/** Tile variant: rounded square background for the app icon and favicon. */
export const markTile = { radius: 27 } as const;
