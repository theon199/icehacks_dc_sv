/**
 * Timing and drag rules for the glass sheet, kept apart from the component so they are tested
 * without rendering. The drag rules run on the UI thread inside the pan gesture.
 */

/** The sheet rises in this long. */
export const SHEET_OPEN_MS = 260;
/** It leaves faster than it arrives, so a dismissal feels answered. */
export const SHEET_CLOSE_MS = 180;

/** Share of the window a sheet may fill before its body scrolls. */
export const SHEET_MAX_HEIGHT_RATIO = 0.85;

/** A release this far down, as a share of the sheet's height, dismisses it. */
export const SHEET_DISMISS_DISTANCE_RATIO = 0.28;
/** The distance rule never asks for less than this, so a short sheet still needs a real drag. */
export const SHEET_DISMISS_MIN_DISTANCE = 56;
/** A downward flick this fast (points per second) dismisses without the distance. */
export const SHEET_DISMISS_VELOCITY = 700;
/** Movement under this is a touch, never a dismissal, however fast it was. */
export const SHEET_DISMISS_MIN_TRAVEL = 8;

/**
 * How far down the sheet must be dragged before a release closes it. A sheet that has not been
 * measured yet falls back to the floor rather than closing on no travel at all.
 */
export function sheetDismissDistance(sheetHeight: number): number {
  'worklet';
  if (!Number.isFinite(sheetHeight) || sheetHeight <= 0) return SHEET_DISMISS_MIN_DISTANCE;
  return Math.max(SHEET_DISMISS_MIN_DISTANCE, sheetHeight * SHEET_DISMISS_DISTANCE_RATIO);
}

export interface SheetRelease {
  translationY: number;
  velocityY: number;
  sheetHeight: number;
}

/**
 * Whether a released drag closes the sheet: an upward or tiny drag never does, a quick downward
 * flick always does, and a slow one has to travel the dismiss distance.
 */
export function shouldDismissSheet({
  translationY,
  velocityY,
  sheetHeight,
}: SheetRelease): boolean {
  'worklet';
  if (!Number.isFinite(translationY) || translationY < SHEET_DISMISS_MIN_TRAVEL) return false;
  if (Number.isFinite(velocityY) && velocityY >= SHEET_DISMISS_VELOCITY) return true;
  return translationY >= sheetDismissDistance(sheetHeight);
}

/** Height a sheet may take for a share of the window, with the share held to 10–100 %. */
export function sheetHeightFor(windowHeight: number, ratio: number): number {
  const share = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0.1), 1) : 1;
  return Math.max(0, windowHeight * share);
}
