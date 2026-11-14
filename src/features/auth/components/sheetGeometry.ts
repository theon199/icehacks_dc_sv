/**
 * Pure geometry for the account sheet, kept apart from the component so it is tested without
 * rendering.
 */

/** Grabber plus the air above (8) and below (12) it. */
export const SHEET_GRABBER_ZONE = 8 + 5 + 12;
/** Air kept between the status bar and a fully raised sheet. */
const TOP_GAP = 8;

export interface SheetHeightInput {
  /** The email step rises to just under the status bar. */
  expanded: boolean;
  /** Natural height of the compact step's content; null until measured. */
  compactHeight: number | null;
  /** Height of the area the sheet sits in. */
  areaHeight: number;
  topInset: number;
}

/**
 * Visible height the sheet should take, or null while it cannot be known yet (the compact step
 * has not been measured). The compact step hugs its content, capped at the tall height.
 */
export function accountSheetHeight({
  expanded,
  compactHeight,
  areaHeight,
  topInset,
}: SheetHeightInput): number | null {
  const tall = Math.max(0, areaHeight - topInset - TOP_GAP);
  if (expanded) return tall;
  if (compactHeight === null || compactHeight <= 0) return null;
  return Math.min(SHEET_GRABBER_ZONE + compactHeight, tall);
}

/** A drag dismisses the sheet when it travels a quarter of the sheet or is flicked down. */
export function shouldDismissSheet(
  translationY: number,
  velocityY: number,
  sheetHeight: number,
): boolean {
  'worklet';
  return translationY > Math.min(160, sheetHeight * 0.25) || velocityY > 900;
}
