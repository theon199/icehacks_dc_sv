/**
 * The camera's pinned night look. The viewfinder and the photo under review are dark in both
 * appearances, so these are fixed rather than taken from the active theme; they are the only raw
 * colours in the feature.
 */
export const camera = {
  /** Behind the viewfinder before the preview starts, and behind the AI gate. */
  black: '#000000',
  /** Text and glyphs on the camera. */
  ink: '#FFFFFF',
  inkMuted: 'rgba(255, 255, 255, 0.88)',
  /** Dark translucent capsules: the hint, the mode switch, the library button, progress cards. */
  capsule: 'rgba(20, 20, 22, 0.58)',
  hairline: 'rgba(255, 255, 255, 0.14)',
  /** Dims a frozen photo under a card. */
  dim: 'rgba(20, 20, 22, 0.42)',
  /** The fade under the controls, clear at its top edge. */
  fade: ['rgba(8, 9, 10, 0)', 'rgba(8, 9, 10, 0.72)'] as const,
} as const;
