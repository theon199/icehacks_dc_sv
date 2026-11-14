/**
 * Shared header metrics. One set of numbers keeps the title, the glass controls and the profile
 * circle on identical pixels on every tab and pushed screen.
 */
import { space } from './tokens';

/**
 * Gap between the safe-area top and the header row. The iOS top inset already ends below the
 * status bar and the Dynamic Island, so only a hairline of air is added above the 44 pt controls.
 */
export const HEADER_TOP_OFFSET = space.xs;

/** Diameter of every round icon control in a header row: the 44 pt minimum touch target. */
export const HEADER_CONTROL_SIZE = 44;

/**
 * Largest Dynamic Type multiplier a header-row title may take. The row is pinned to
 * `HEADER_CONTROL_SIZE`, and 1.4x keeps a 24/30 pt title inside it instead of clipping.
 */
export const HEADER_TITLE_MAX_FONT_SCALE = 1.4;

/** Horizontal inset of every tab header. */
export const TAB_HEADER_GUTTER = space.lg;

/**
 * Space between the header row and the first content under it. The header owns this gap, so
 * content beneath adds no top padding of its own.
 */
export const TAB_HEADER_BOTTOM_GAP = space.md;

/**
 * Height of a tab header below the safe-area inset. Content scrolling under a floating header
 * starts `insets.top + TAB_HEADER_HEIGHT` from the top.
 */
export const TAB_HEADER_HEIGHT = HEADER_TOP_OFFSET + HEADER_CONTROL_SIZE + TAB_HEADER_BOTTOM_GAP;
