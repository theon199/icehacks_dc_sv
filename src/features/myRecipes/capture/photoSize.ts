/** Size rules for recipe-card photos sent to the import function. Pure, so they are easy to test. */

/**
 * Longest edge sent to the AI. A little larger than Snap's: handwriting on a card needs more
 * pixels than a fridge shelf does.
 */
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.72;
/** Second, smaller attempt when a photo is still too large after the first pass. */
export const FALLBACK_EDGE = 1200;
export const FALLBACK_QUALITY = 0.6;
/** The function accepts up to 3 MB decoded; keep a margin. */
export const MAX_UPLOAD_BYTES = 2_800_000;

export interface Size {
  width: number;
  height: number;
}

/** The size that keeps the longest edge within `maxEdge`, or null when it already fits. */
export function fitWithin(size: Size, maxEdge: number = MAX_EDGE): Size | null {
  const { width, height } = size;
  if (!(width > 0) || !(height > 0)) return null;
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return null;
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Decoded byte size of a base64 string. */
export function base64Bytes(base64: string): number {
  const clean = base64.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}
