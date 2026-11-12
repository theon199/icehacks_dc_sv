/**
 * Storage access for Community: signed URLs for post photos (private `post-media` bucket) and
 * public URLs for avatars (`avatars` bucket).
 */
import { supabase } from '@/lib/supabase/client';

import { toApiError } from './rpcError';

export const POST_MEDIA_BUCKET = 'post-media';
const AVATAR_BUCKET = 'avatars';
/** Signed photo links outlive any cached feed page (pages refetch well before this). */
const SIGNED_URL_SECONDS = 2 * 60 * 60;

/** Public URL for an avatar path, or null when the person has none. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Signs every distinct path in one request. Paths the server refuses (removed, not visible) map to
 * nothing, so their slot shows the blurhash placeholder instead of breaking the page.
 */
export async function signMediaPaths(paths: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;
  const { data, error } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error) throw toApiError('post-media.sign', error);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}
