/**
 * A photo of the finished dish: taken or picked, then re-encoded as a JPEG no larger than 1600 px
 * on its longest side. Re-encoding also leaves out the original file's metadata (such as where it
 * was taken).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { fitWithin } from '../logic/session';

export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_QUALITY = 0.8;

export interface CookPhoto {
  uri: string;
  width: number;
  height: number;
}

export type PhotoSource = 'camera' | 'library';

export type PickResult =
  | { status: 'picked'; photo: CookPhoto }
  | { status: 'cancelled' }
  /** Camera access was refused; the library picker needs no permission. */
  | { status: 'denied' };

export async function compressPhoto(input: CookPhoto): Promise<CookPhoto> {
  const context = ImageManipulator.manipulate(input.uri);
  const size = fitWithin(input.width, input.height, PHOTO_MAX_EDGE);
  if (size) context.resize(size);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

export async function pickCookPhoto(source: PhotoSource): Promise<PickResult> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    exif: false,
  };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'cancelled' };
  const photo = await compressPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
  return { status: 'picked', photo };
}
