/**
 * Colors for words and chips laid over a recipe photo. A photo looks the same in light and dark
 * appearance, so these come from the light palette's ink and paper rather than the active theme.
 */
import { withAlpha } from './color';
import { palettes } from './tokens';

const ink = palettes.light.text;
const paper = palettes.light.surface;

export const photoOverlay = {
  text: paper,
  textMuted: withAlpha(paper, 0.84),
  /** Translucent dark capsule behind stats on a photo. */
  chip: withAlpha(ink, 0.5),
  /** Bottom scrim that keeps the title legible on any photo, top to bottom. */
  scrim: [withAlpha(ink, 0), withAlpha(ink, 0.28), withAlpha(ink, 0.84)] as const,
  scrimStops: [0, 0.35, 1] as const,
} as const;
