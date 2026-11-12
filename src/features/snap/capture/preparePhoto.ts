/**
 * Turns a camera or library photo into what the snap function accepts: a JPEG (never HEIC) whose
 * longest edge is at most 1280 px, as base64. A photo still too large after that gets one smaller
 * pass before giving up.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import {
  base64Bytes,
  FALLBACK_EDGE,
  FALLBACK_QUALITY,
  fitWithin,
  JPEG_QUALITY,
  MAX_EDGE,
  MAX_UPLOAD_BYTES,
} from './photoSize';
import { PhotoPrepError } from '../logic/snapErrors';

export interface PhotoSource {
  uri: string;
  /** Pixel size when known; 0 lets the manipulator read it. */
  width: number;
  height: number;
}

export interface PreparedPhoto {
  uri: string;
  base64: string;
  width: number;
  height: number;
}

async function encode(source: PhotoSource, maxEdge: number, quality: number) {
  const context = ImageManipulator.manipulate(source.uri);
  try {
    const target = fitWithin(source, maxEdge);
    if (target) context.resize(target);
    else if (!(source.width > 0 && source.height > 0)) {
      // Unknown size: render once to learn it, then resize from the original.
      const probe = await context.renderAsync();
      const size = fitWithin({ width: probe.width, height: probe.height }, maxEdge);
      probe.release();
      if (size) context.resize(size);
    }
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

export async function preparePhoto(source: PhotoSource): Promise<PreparedPhoto> {
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
