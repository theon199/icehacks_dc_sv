/**
 * Getting a picked photo onto the server: shrink to at most 1600 px on the long edge, re-encode as
 * JPEG (quality 0.8, which also converts HEIC), compute a blurhash placeholder and upload it to
 * `post-media/<uid>/` with progress. Uploads are write-once, so every photo gets a fresh name.
 */
import { File, UploadTask, UploadType } from 'expo-file-system';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { ApiError, kindForStatus } from '@/lib/api/errors';
import { getPublicEnv } from '@/lib/env';
import { newId } from '@/lib/id';
import { getAccessToken, supabase } from '@/lib/supabase/client';

import { POST_MEDIA_BUCKET } from '../api/media';
import { toApiError } from '../api/rpcError';
import { COMPOSE_LIMITS, fitWithin, type DraftPhoto } from '../logic/compose';

export interface PreparedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Resized, JPEG-encoded copy of a picked photo. */
export async function preparePhoto(photo: DraftPhoto): Promise<PreparedPhoto> {
  const target = fitWithin(photo.width, photo.height, COMPOSE_LIMITS.photoEdge);
  const context = ImageManipulator.manipulate(photo.uri);
  if (target.width !== photo.width || target.height !== photo.height) {
    context.resize({ width: target.width, height: target.height });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: COMPOSE_LIMITS.photoQuality,
    format: SaveFormat.JPEG,
  });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** A small blurhash for the placeholder, or null if it cannot be computed (never blocks posting). */
export async function blurhashFor(uri: string): Promise<string | null> {
  try {
    const hash = await Image.generateBlurhashAsync(uri, [4, 3]);
    return hash && hash.length <= 100 ? hash : null;
  } catch {
    return null;
  }
}

export interface UploadOptions {
  userId: string;
  photo: PreparedPhoto;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Uploads one prepared photo and returns its storage path. */
export async function uploadPhoto({
  userId,
  photo,
  onProgress,
  signal,
}: UploadOptions): Promise<string> {
  const path = `${userId}/${newId()}.jpg`;

  if (Platform.OS === 'web') {
    const blob = await (await fetch(photo.uri)).blob();
    const { error } = await supabase.storage
      .from(POST_MEDIA_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw toApiError('post-media.upload', error);
    onProgress?.(1);
    return path;
  }

  const env = getPublicEnv();
  const token = await getAccessToken();
  if (!token) throw new ApiError({ kind: 'unauthorized', functionName: 'post-media.upload' });

  const task = new UploadTask(
    new File(photo.uri),
    `${env.supabaseUrl}/storage/v1/object/${POST_MEDIA_BUCKET}/${path}`,
    {
      httpMethod: 'POST',
      uploadType: UploadType.BINARY_CONTENT,
      mimeType: 'image/jpeg',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.supabasePublishableKey,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'false',
        'cache-control': 'max-age=31536000',
      },
      onProgress: ({ bytesSent, totalBytes }) => {
        if (totalBytes > 0) onProgress?.(bytesSent / totalBytes);
      },
      ...(signal ? { signal } : {}),
    },
  );

  let status: number;
  try {
    status = (await task.uploadAsync()).status;
  } catch (cause) {
    const kind = signal?.aborted ? 'cancelled' : 'network';
    throw new ApiError({ kind, functionName: 'post-media.upload', cause });
  } finally {
    task.release();
  }
  if (status < 200 || status >= 300) {
    throw new ApiError({
      kind: kindForStatus(status),
      functionName: 'post-media.upload',
      status,
      ...(status === 413 ? { serverMessage: 'That photo is too large to upload.' } : {}),
    });
  }
  onProgress?.(1);
  return path;
}
