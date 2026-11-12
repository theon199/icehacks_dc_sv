/**
 * Photo attachments for Chef. Photos are shrunk on the device and re-encoded as JPEG (which also
 * turns HEIC camera shots into something the AI can read) until they fit the function's limit.
 * The native modules load on first use, so screens that only show Chef never pay for them.
 */
export const MAX_PHOTO_BYTES = 1_500_000;

/** Encoding attempts, largest first; the first one that fits is used. */
export const PHOTO_ATTEMPTS: readonly { readonly width: number; readonly quality: number }[] = [
  { width: 1280, quality: 0.7 },
  { width: 1024, quality: 0.55 },
  { width: 768, quality: 0.45 },
];

export interface PreparedPhoto {
  /** Local file of the compressed image, for the preview. */
  readonly uri: string;
  /** JPEG bytes as base64, as the `chef` function expects. */
  readonly base64: string;
  readonly width: number;
  readonly height: number;
}

export type PhotoSource = 'camera' | 'library';

export class PhotoError extends Error {
  constructor(
    readonly reason: 'permission' | 'too_large' | 'unreadable',
    message: string,
  ) {
    super(message);
    this.name = 'PhotoError';
  }
}

/** Decoded size of a base64 string. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Asks for a photo; null when the person cancels. */
export async function pickPhoto(
  source: PhotoSource,
): Promise<{ uri: string; width: number } | null> {
  const picker = await import('expo-image-picker');
  if (source === 'camera') {
    const permission = await picker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new PhotoError('permission', 'Allow camera access in Settings to take a photo.');
    }
  }
  const options = { mediaTypes: ['images' as const], quality: 1, exif: false };
  const result =
    source === 'camera'
      ? await picker.launchCameraAsync(options)
      : await picker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width } : null;
}

/** Resizes and compresses a photo until it fits `MAX_PHOTO_BYTES`. */
export async function preparePhoto(uri: string, sourceWidth: number): Promise<PreparedPhoto> {
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  for (const attempt of PHOTO_ATTEMPTS) {
    const width = sourceWidth > 0 ? Math.min(attempt.width, sourceWidth) : attempt.width;
    const rendered = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: attempt.quality,
      base64: true,
    });
    if (!saved.base64) throw new PhotoError('unreadable', "That photo couldn't be read.");
    if (base64Bytes(saved.base64) <= MAX_PHOTO_BYTES) {
      return { uri: saved.uri, base64: saved.base64, width: saved.width, height: saved.height };
    }
  }
  throw new PhotoError('too_large', 'That photo is too large. Try another one.');
}
