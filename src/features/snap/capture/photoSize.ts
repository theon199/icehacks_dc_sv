/** Size rules for photos sent to the snap function. Pure, so they are easy to test. */

/** Longest edge sent to the AI. Enough to read labels, small enough to upload quickly. */
export const MAX_EDGE = 1280;
export const JPEG_QUALITY = 0.75;
/** Second, smaller attempt if a photo is still too large after the first pass. */
export const FALLBACK_EDGE = 960;
export const FALLBACK_QUALITY = 0.6;
/** The snap function accepts up to 3 MB decoded; keep a margin for safety. */
export const MAX_UPLOAD_BYTES = 2_800_000;

export interface Size {
  width: number;
  height: number;
}

/**
 * The size to resize to so the longest edge is at most `maxEdge`, keeping the aspect ratio, or
 * null when the photo is already small enough (it is still re-encoded as JPEG).
 */
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

/** Decoded byte size of a base64 string (ignoring any whitespace). */
export function base64Bytes(base64: string): number {
  const clean = base64.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}
