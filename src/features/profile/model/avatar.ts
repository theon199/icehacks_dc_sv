/**
 * Avatar sizing and storage paths. Photos are scaled so the longer side is at most 512 px and saved
 * as JPEG, which keeps uploads far below the bucket's 2 MB limit.
 */

export const AVATAR_MAX_DIMENSION = 512;
export const AVATAR_JPEG_QUALITY = 0.8;
/** The avatars bucket refuses larger files. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export interface Size {
  width: number;
  height: number;
}

/**
 * The size to resize to so neither side exceeds `max`, keeping the aspect ratio. Returns null when
 * the image already fits (no resize needed) or the input is unusable.
 */
export function fitWithin(size: Size, max = AVATAR_MAX_DIMENSION): Size | null {
  const { width, height } = size;
  if (!(width > 0 && height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= max && height <= max) return null;
  const scale = max / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * A fresh object path under the owner's folder (the bucket policy and the `profiles.avatar_path`
 * check both require `<user id>/…`). A new name per upload means caches never show a stale photo.
 */
export function avatarObjectPath(userId: string, fileId: string): string {
  return `${userId}/${fileId}.jpg`;
}
