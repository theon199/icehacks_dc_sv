/**
 * One still for one question: the camera frame re-encoded as a small JPEG, as base64. Smaller than
 * a Snap photo (the coach only needs to see the pan, and someone is waiting), and re-encoding
 * leaves out the original file's metadata. Nothing is kept: the camera's frame and the re-encoded
 * file are both deleted from the cache once the still has been read, whether or not it worked.
 */
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import { fitWithin } from '../../logic/session';

export const COACH_PHOTO_MAX_EDGE = 1024;
export const COACH_PHOTO_QUALITY = 0.7;
/** The coach function accepts up to 3 MB decoded; a 1024 px JPEG is far below that. */
export const COACH_PHOTO_MAX_BYTES = 2_800_000;

export interface CoachStill {
  base64: string;
  width: number;
  height: number;
}

export interface CameraFrame {
  uri: string;
  width: number;
  height: number;
}

/** Decoded byte size of a base64 string. */
export function base64Bytes(base64: string): number {
  const clean = base64.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/** Deletes a cache file; one that is already gone, or cannot be deleted now, is left to the OS. */
function discard(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The cache is the OS's to clear; a leftover file must never fail a question.
  }
}

/** Shrinks and re-encodes `frame`, then deletes both its file and the re-encoded one. */
export async function prepareCoachStill(frame: CameraFrame): Promise<CoachStill> {
  const context = ImageManipulator.manipulate(frame.uri);
  let image: ImageRef | null = null;
  let savedUri: string | null = null;
  try {
    const size = fitWithin(frame.width, frame.height, COACH_PHOTO_MAX_EDGE);
    if (size) context.resize(size);
    image = await context.renderAsync();
    const saved = await image.saveAsync({
      base64: true,
      compress: COACH_PHOTO_QUALITY,
      format: SaveFormat.JPEG,
    });
    savedUri = saved.uri;
    if (!saved.base64 || base64Bytes(saved.base64) > COACH_PHOTO_MAX_BYTES) {
      throw new Error('The coach photo could not be made small enough');
    }
    return { base64: saved.base64, width: saved.width, height: saved.height };
  } finally {
    image?.release();
    context.release();
    discard(frame.uri);
    discard(savedUri);
  }
}
