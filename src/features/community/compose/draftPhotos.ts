/**
 * Saved drafts point at photos in the picker's temporary folder, which iOS may clear at any time.
 * Before a restored draft is shown, photos whose file has gone are dropped so the person can add
 * them again instead of hitting an upload error later.
 */
import { File } from 'expo-file-system';

import type { DraftPhoto } from '../logic/compose';

/** Whether the photo's file is still on the device. Unknown (e.g. on web) counts as present. */
function fileStillThere(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return true;
  }
}

/** The photos that can still be uploaded, in their original order. */
export function keepAvailablePhotos(photos: readonly DraftPhoto[]): DraftPhoto[] {
  return photos.filter((photo) => fileStillThere(photo.uri));
}
