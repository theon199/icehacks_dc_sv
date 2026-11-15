/**
 * Photos of recipe cards: taken or picked, then shrunk and re-encoded as JPEG on the device
 * (which also turns HEIC camera shots into something the AI can read). The native modules load on
 * first use, so the recipe list never pays for them.
 */
import {
  base64Bytes,
  FALLBACK_EDGE,
  FALLBACK_QUALITY,
  fitWithin,
  JPEG_QUALITY,
  MAX_EDGE,
  MAX_UPLOAD_BYTES,
  type Size,
} from './photoSize';
import { PhotoPrepError } from '../logic/importErrors';

export type PhotoOrigin = 'camera' | 'library';

export interface PickedPhoto extends Size {
  uri: string;
}

export interface PreparedPhoto extends Size {
  uri: string;
  base64: string;
}

/** Thrown when the person has not allowed the camera. */
export class CameraPermissionError extends Error {
  constructor() {
    super('Allow camera access for Famara in Settings to take a photo.');
    this.name = 'CameraPermissionError';
  }
}

/** Asks for a photo; null when the person cancels. */
export async function pickPhoto(origin: PhotoOrigin): Promise<PickedPhoto | null> {
  const picker = await import('expo-image-picker');
  if (origin === 'camera') {
    const permission = await picker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new CameraPermissionError();
  }
  const options = { mediaTypes: ['images' as const], quality: 1, exif: false };
  const result =
    origin === 'camera'
      ? await picker.launchCameraAsync(options)
      : await picker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

async function encode(source: PickedPhoto, maxEdge: number, quality: number) {
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  const context = ImageManipulator.manipulate(source.uri);
  try {
    const target = fitWithin(source, maxEdge);
    if (target) context.resize(target);
    const image = await context.renderAsync();
    try {
      return await image.saveAsync({ base64: true, compress: quality, format: SaveFormat.JPEG });
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

/** A JPEG within the upload limit, as base64. */
export async function preparePhoto(source: PickedPhoto): Promise<PreparedPhoto> {
  try {
    let result = await encode(source, MAX_EDGE, JPEG_QUALITY);
    if (!result.base64 || base64Bytes(result.base64) > MAX_UPLOAD_BYTES) {
      result = await encode(
        { uri: result.uri, width: result.width, height: result.height },
        FALLBACK_EDGE,
        FALLBACK_QUALITY,
      );
    }
    const base64 = result.base64;
    if (!base64 || base64Bytes(base64) > MAX_UPLOAD_BYTES) {
      throw new PhotoPrepError('Photo is too large after compression');
    }
    return { uri: result.uri, base64, width: result.width, height: result.height };
  } catch (error) {
    if (error instanceof PhotoPrepError) throw error;
    throw new PhotoPrepError('Could not prepare photo', { cause: error });
  }
}
