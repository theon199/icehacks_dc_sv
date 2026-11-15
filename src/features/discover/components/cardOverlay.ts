/**
 * Colors for the deck card, which is always a photo: the same in light and dark appearance, so
 * they come from the light palette's ink and paper rather than the active theme.
 */
import { photoOverlay } from '@/ui';
import { withAlpha } from '@/ui/color';
import { palettes } from '@/ui/tokens';

const ink = palettes.light.text;
const paper = palettes.light.surface;

export const cardOverlay = {
  text: photoOverlay.text,
  textMuted: withAlpha(paper, 0.88),
  /** Flat dark capsule for figures on the photo, dark enough for white text on a pale dish. */
  chip: withAlpha(ink, 0.46),
  /** Light hairline that keeps a dark chip reading as a separate layer. */
  chipBorder: withAlpha(paper, 0.34),
  /** The melt's dark foot, clear at its top edge. */
  melt: [withAlpha(ink, 0), withAlpha(ink, 0.45)] as const,
  /** Card back: a flat wash over the frost that keeps white text legible on any photo. */
  frost: withAlpha(ink, 0.42),
  /** Card back panels: a faint dark tint inside clear glass, and its edge. */
  panel: withAlpha(ink, 0.28),
  /** The panel's fill where Liquid Glass is unavailable. */
  panelFallback: withAlpha(paper, 0.12),
  panelEdge: withAlpha(paper, 0.3),
  /** Ingredient dot for something not in the pantry. */
  dot: withAlpha(paper, 0.45),
} as const;
