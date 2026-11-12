/**
 * The narrow interface this feature needs from modules that other areas own: the community feed
 * (posts by an author, recently active cooks) and the recipe catalog (cuisine list).
 *
 * Each function has a direct, working implementation here. When the owning module offers the same
 * query, point the function at it; nothing else in the profile feature needs to change.
 */
import { z } from 'zod';

import { catalogQuery } from '@/lib/db/catalog';
import { getSupabase } from '@/lib/supabase/client';

import { dbError } from './api/errors';
import { parseResponse } from './api/schemas';
import type { Person } from './model/connections';

const POST_MEDIA_BUCKET = 'post-media';
/** Signed photo links last an hour; post queries refetch well before that. */
const SIGNED_URL_SECONDS = 60 * 60;

const feedCardSchema = z.object({
  id: z.string(),
  author_id: z.string(),
  author_handle: z.string(),
  author_display_name: z.string(),
  author_avatar_path: z.string().nullable(),
  author_is_team: z.boolean(),
  kind: z.string(),
  title: z.string(),
  status: z.string(),
  like_count: z.number(),
  comment_count: z.number(),
  created_at: z.string(),
  media: z
    .array(z.object({ path: z.string(), position: z.number() }))
    .nullable()
    .transform((value) => value ?? []),
});
type FeedCard = z.infer<typeof feedCardSchema>;

const feedPageSchema = z.object({
  items: z.array(feedCardSchema),
  next_cursor: z.string().nullable(),
});

export interface PostTileData {
  id: string;
  title: string;
  /** `visible`, or `hidden` / `removed` for the author's own held posts. */
  status: string;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  /** Signed URL of the first photo, or null for a text-only post. */
  coverUrl: string | null;
  photoCount: number;
}

export interface AuthorPostsPage {
  items: PostTileData[];
  nextCursor: string | null;
}

function coverPath(card: FeedCard): string | null {
  const first = [...card.media].sort((a, b) => a.position - b.position)[0];
  return first?.path ?? null;
}

async function signCovers(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await getSupabase()
    .storage.from(POST_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  // A missing photo should not hide the post; the tile falls back to its title.
  if (error || !data) return new Map();
  const urls = new Map<string, string>();
  for (const entry of data) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

async function fetchFeed(args: Record<string, unknown>) {
  const { data, error } = await getSupabase().rpc('get_feed', args);
  if (error) throw dbError('get_feed', error);
  return parseResponse('get_feed', feedPageSchema, data);
}

/** One page of an author's posts, newest first, with signed cover photos. */
export async function fetchAuthorPosts(
  authorId: string,
  cursor: string | null,
  limit = 24,
): Promise<AuthorPostsPage> {
  const page = await fetchFeed({
    p_mode: 'author',
    p_author_id: authorId,
    p_limit: limit,
    ...(cursor ? { p_cursor: cursor } : {}),
  });
  const covers = page.items.map(coverPath);
  const urls = await signCovers(covers.filter((path): path is string => path != null));
  return {
    items: page.items.map((card, index) => {
      const path = covers[index];
      return {
        id: card.id,
        title: card.title,
        status: card.status,
        likeCount: card.like_count,
        commentCount: card.comment_count,
        createdAt: card.created_at,
        coverUrl: path ? (urls.get(path) ?? null) : null,
        photoCount: card.media.length,
      };
    }),
    nextCursor: page.next_cursor,
  };
}

/** Authors of recent popular posts, used to suggest people when the follow graph is thin. */
export async function fetchActiveCooks(limit = 30): Promise<Person[]> {
  const page = await fetchFeed({ p_mode: 'popular', p_limit: limit });
  const people = new Map<string, Person>();
  for (const card of page.items) {
    if (people.has(card.author_id)) continue;
    people.set(card.author_id, {
      id: card.author_id,
      handle: card.author_handle,
      displayName: card.author_display_name,
      avatarPath: card.author_avatar_path,
      isTeam: card.author_is_team,
    });
  }
  return [...people.values()];
}

const cuisineRow = z.object({ cuisine: z.string() });

/** Every cuisine id in the bundled catalog, alphabetically. */
export async function listCatalogCuisines(): Promise<string[]> {
  const rows = await catalogQuery(
    'SELECT DISTINCT cuisine FROM recipes WHERE cuisine <> \'\' ORDER BY cuisine',
    [],
    cuisineRow,
  );
  return rows.map((row) => row.cuisine);
}
