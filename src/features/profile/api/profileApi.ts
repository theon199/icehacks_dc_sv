/**
 * Reads and writes the signed-in person's profile, stats, badges and avatar.
 */
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { z } from 'zod';

import { ApiError } from '@/lib/api/errors';
import { newId } from '@/lib/id';
import { getSupabase } from '@/lib/supabase/client';
import type { MyStats } from '@/lib/supabase/database.types';

import { dbError, storageError } from './errors';
import {
  badgeDefinitionSchema,
  myStatsSchema,
  parseResponse,
  PROFILE_COLUMNS,
  profileRowSchema,
  type ProfileRow,
} from './schemas';
import {
  AVATAR_JPEG_QUALITY,
  AVATAR_MAX_BYTES,
  avatarObjectPath,
  fitWithin,
} from '../model/avatar';
import type { BadgeDefinition } from '../model/badges';
import type { ProfilePatch } from '../model/profileForm';

const AVATAR_BUCKET = 'avatars';

/** Columns written by `updateProfile`: the form fields plus the avatar. */
export type ProfileUpdate = ProfilePatch & { avatar_path?: string | null };

export async function fetchProfile(userId: string): Promise<ProfileRow> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single();
  if (error) throw dbError('profiles.select', error);
  return parseResponse('profiles.select', profileRowSchema, data);
}

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<ProfileRow> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw dbError('profiles.update', error);
  return parseResponse('profiles.update', profileRowSchema, data);
}

export async function fetchMyStats(today: string): Promise<MyStats> {
  const { data, error } = await getSupabase().rpc('my_stats', { p_today: today });
  if (error) throw dbError('my_stats', error);
  return parseResponse('my_stats', myStatsSchema, data);
}

export async function fetchBadgeCatalog(): Promise<BadgeDefinition[]> {
  const { data, error } = await getSupabase()
    .from('badges')
    .select('id, name, description, metric, threshold, sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw dbError('badges.select', error);
  return parseResponse('badges.select', z.array(badgeDefinitionSchema), data);
}

/** Public URL of an avatar object, or null when the person has none. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return getSupabase().storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

/** Scales a picked photo to at most 512 px and re-encodes it as JPEG. Returns the new file URI. */
export async function compressAvatar(image: PickedImage): Promise<string> {
  const context = ImageManipulator.manipulate(image.uri);
  const target = fitWithin(image);
  if (target) context.resize(target);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: AVATAR_JPEG_QUALITY,
  });
  return saved.uri;
}

/**
 * Uploads a new avatar and points the profile at it. When the profile update fails, the upload is
 * only removed once a fresh read shows the profile does not use it: a lost response can hide an
 * update that did commit, and deleting the file then would break the avatar. If that read fails
 * too, the file is kept; an unused object is cheaper than a broken photo.
 */
export async function replaceAvatar(userId: string, image: PickedImage): Promise<ProfileRow> {
  const uri = await compressAvatar(image);
  const bytes = await new File(uri).arrayBuffer();
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    throw new ApiError({
      kind: 'validation',
      functionName: 'avatars.upload',
      code: 'too_large',
      serverMessage: 'That photo is too large. Try a different one.',
    });
  }

  const path = avatarObjectPath(userId, newId());
  const storage = getSupabase().storage.from(AVATAR_BUCKET);
  const { error: uploadError } = await storage.upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
    cacheControl: '31536000',
  });
  if (uploadError) throw storageError('avatars.upload', uploadError);

  try {
    return await updateProfile(userId, { avatar_path: path });
  } catch (error) {
    const current = await fetchProfile(userId).catch(() => null);
    if (current?.avatar_path === path) return current;
    if (current) await storage.remove([path]).catch(() => undefined);
    throw error;
  }
}

/** Removes the avatar from the profile. The old file is queued for deletion by the server. */
export async function clearAvatar(userId: string): Promise<ProfileRow> {
  return updateProfile(userId, { avatar_path: null });
}
