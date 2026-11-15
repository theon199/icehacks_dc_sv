/**
 * Planner metrics shared by the week pager, the day strip and the day cards, so the pieces line up
 * on the 16 pt gutter whatever the screen size.
 */
import { gutter, space } from '@/ui';

/** How much of the next day's card shows at the right edge. */
export const DAY_CARD_PEEK = 32;
export const DAY_CARD_GAP = space.md;
/** One day of the strip: initial, date and the has-meals dot. Fixed so weeks never shift. */
export const WEEK_STRIP_HEIGHT = 58;
/** The week's relative name over its date range. */
export const WEEK_TITLE_HEIGHT = 40;
/** A planned meal or the add button inside a meal tile. */
export const SLOT_ROW_HEIGHT = 56;
export const SLOT_ART_SIZE = 48;

/** Card width: the screen less both gutters and the peek, floored so small phones keep a card. */
export function dayCardWidth(windowWidth: number): number {
  return Math.max(240, windowWidth - gutter * 2 - DAY_CARD_PEEK);
}

/**
 * Card height: a tall card proportion, capped at a little over half the window so the week strip
 * stays above it and the saved list starts below it on a short phone.
 */
export function dayCardHeight(cardWidth: number, windowHeight: number): number {
  return Math.min(Math.round(cardWidth * 1.46), Math.round(windowHeight * 0.56));
}

/** One card plus the gap: what the rail snaps by. */
export function daySnapInterval(cardWidth: number): number {
  return cardWidth + DAY_CARD_GAP;
}
