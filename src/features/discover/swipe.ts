/**
 * Swipe physics for the deck, kept free of React so the thresholds can be tested on their own.
 * Functions marked as worklets run on the UI thread inside gesture callbacks.
 */

/** Share of the card width a drag must cover to count as a decision. */
export const SWIPE_DISTANCE_RATIO = 0.3;
/** Fling speed (points per second) that decides even a short drag. */
export const SWIPE_VELOCITY = 900;
/** A fling still has to move at least this share of the distance, so a flick-tap never decides. */
export const FLING_MIN_RATIO = 0.2;
/** Tilt at a full card width of drag, in degrees. */
export const MAX_ROTATION = 14;
/** Each card below the top sits this much smaller and lower. */
export const STACK_SCALE = 0.05;
export const STACK_OFFSET = 12;
/** Cards rendered at once; the rest wait in the queue. */
export const MOUNTED_CARDS = 3;
/** Photos fetched ahead of the mounted cards. */
export const PREFETCH_AHEAD = 3;

/** -1 pass (left), 1 like (right), 0 for a drag that should spring back. */
export type SwipeDirection = -1 | 0 | 1;

export function swipeDistance(width: number): number {
  'worklet';
  return Math.max(60, width * SWIPE_DISTANCE_RATIO);
}

export function swipeDirection(dx: number, vx: number, distance: number): SwipeDirection {
  'worklet';
  const minFling = distance * FLING_MIN_RATIO;
  if (dx >= distance || (vx >= SWIPE_VELOCITY && dx >= minFling)) return 1;
  if (dx <= -distance || (vx <= -SWIPE_VELOCITY && dx <= -minFling)) return -1;
  return 0;
}

/** Card tilt for a horizontal offset, proportional and capped at `MAX_ROTATION`. */
export function tiltFor(dx: number, width: number): number {
  'worklet';
  if (width <= 0) return 0;
  const ratio = Math.max(-1, Math.min(1, dx / width));
  return ratio * MAX_ROTATION;
}

/** How far a card sits below the top, given its depth and the top card's drag progress (0..1). */
export function stackLift(depth: number, progress: number): number {
  'worklet';
  return Math.max(0, depth - progress);
}
