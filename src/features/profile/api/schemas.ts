/**
 * zod schemas for everything the profile feature reads from Supabase. Responses are parsed before
 * use; a shape mismatch becomes a typed server error instead of a crash deep in a component.
 */
import { z } from 'zod';

import { ApiError, INVALID_RESPONSE } from '@/lib/api/errors';

export const profileRowSchema = z.object({
  id: z.string(),
  handle: z.string(),
  display_name: z.string(),
  avatar_path: z.string().nullable(),
  bio: z.string(),
  cuisines: z.array(z.string()),
  is_team: z.boolean(),
});
export type ProfileRow = z.infer<typeof profileRowSchema>;

export const PROFILE_COLUMNS = 'id, handle, display_name, avatar_path, bio, cuisines, is_team';

/** The few profile columns shown in lists. */
export const personRowSchema = z.object({
  id: z.string(),
  handle: z.string(),
  display_name: z.string(),
  avatar_path: z.string().nullable(),
  is_team: z.boolean(),
});
export type PersonRow = z.infer<typeof personRowSchema>;

export const PERSON_COLUMNS = 'id, handle, display_name, avatar_path, is_team';

const count = z.number().catch(0);

export const myStatsSchema = z.object({
  cooked_count: count,
  cooked_this_week: count,
  current_streak: count,
  longest_streak: count,
  last_cooked_at: z.string().nullable().catch(null),
  cuisine_count: count,
  cuisines: z
    .array(z.object({ cuisine: z.string(), count: z.number() }))
    .nullable()
    .transform((value) => value ?? []),
  post_count: count,
  likes_received: count,
  badges: z
    .array(z.object({ badge_id: z.string(), awarded_at: z.string() }))
    .nullable()
    .transform((value) => value ?? []),
});

export const badgeDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  metric: z.string(),
  threshold: z.number(),
  sort_order: z.number(),
});

export const friendInviteSchema = z.object({ code: z.string(), expires_at: z.string() });

export const openInviteSchema = z.object({
  code: z.string(),
  expires_at: z.string(),
  created_at: z.string(),
});
export type OpenInvite = z.infer<typeof openInviteSchema>;

export const redeemedInviteSchema = z.object({
  inviter_id: z.string(),
  inviter_handle: z
    .string()
    .nullable()
    .transform((value) => value ?? ''),
});

/** Parses a response, reporting a mismatch as a non-retryable server error. */
export function parseResponse<S extends z.ZodType>(
  operation: string,
  schema: S,
  data: unknown,
): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  throw new ApiError({
    kind: 'server',
    functionName: operation,
    code: INVALID_RESPONSE,
    cause: parsed.error,
  });
}
