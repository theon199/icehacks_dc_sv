/**
 * Follows, friend invites and the follow graph around the signed-in person.
 *
 * Follow rows are readable through RLS (blocked pairs are hidden) and joined to `profiles`; a
 * profile that RLS hides comes back as null and is skipped.
 */
import { z } from 'zod';

import { getSupabase } from '@/lib/supabase/client';
import type { FriendInvite, RedeemedInvite } from '@/lib/supabase/database.types';

import { dbError } from './errors';
import {
  friendInviteSchema,
  openInviteSchema,
  parseResponse,
  PERSON_COLUMNS,
  personRowSchema,
  redeemedInviteSchema,
  type OpenInvite,
  type PersonRow,
} from './schemas';
import type { FollowLists, Person, SecondDegreeEdge } from '../model/connections';

/** Upper bound on each follow list; far beyond what one person's Friends screen shows. */
const FOLLOW_LIST_LIMIT = 1000;
/** How many of my follows are sampled for suggestions, and how many of their edges are read. */
const SECOND_DEGREE_SOURCES = 50;
const SECOND_DEGREE_EDGES = 400;

export function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    isTeam: row.is_team,
  };
}

const followeeRows = z.array(z.object({ followee: personRowSchema.nullable() }));
const followerRows = z.array(z.object({ follower: personRowSchema.nullable() }));
const edgeRows = z.array(
  z.object({ follower_id: z.string(), followee: personRowSchema.nullable() }),
);

export async function fetchFollowLists(userId: string): Promise<FollowLists> {
  const client = getSupabase();
  const [following, followers] = await Promise.all([
    client
      .from('follows')
      .select(`followee:profiles!follows_followee_id_fkey(${PERSON_COLUMNS})`)
      .eq('follower_id', userId)
      .order('created_at', { ascending: false })
      .limit(FOLLOW_LIST_LIMIT),
    client
      .from('follows')
      .select(`follower:profiles!follows_follower_id_fkey(${PERSON_COLUMNS})`)
      .eq('followee_id', userId)
      .order('created_at', { ascending: false })
      .limit(FOLLOW_LIST_LIMIT),
  ]);
  if (following.error) throw dbError('follows.following', following.error);
  if (followers.error) throw dbError('follows.followers', followers.error);

  return {
    following: parseResponse('follows.following', followeeRows, following.data).flatMap((row) =>
      row.followee ? [toPerson(row.followee)] : [],
    ),
    followers: parseResponse('follows.followers', followerRows, followers.data).flatMap((row) =>
      row.follower ? [toPerson(row.follower)] : [],
    ),
  };
}

/** Who the people I follow are following, most recent first. */
export async function fetchSecondDegree(
  followingIds: readonly string[],
): Promise<SecondDegreeEdge[]> {
  const sources = followingIds.slice(0, SECOND_DEGREE_SOURCES);
  if (sources.length === 0) return [];
  const { data, error } = await getSupabase()
    .from('follows')
    .select(`follower_id, followee:profiles!follows_followee_id_fkey(${PERSON_COLUMNS})`)
    .in('follower_id', sources)
    .order('created_at', { ascending: false })
    .limit(SECOND_DEGREE_EDGES);
  if (error) throw dbError('follows.second_degree', error);
  return parseResponse('follows.second_degree', edgeRows, data).flatMap((row) =>
    row.followee ? [{ via: row.follower_id, person: toPerson(row.followee) }] : [],
  );
}

export async function followUser(userId: string): Promise<void> {
  const { error } = await getSupabase().rpc('follow_user', { p_user_id: userId });
  if (error) throw dbError('follow_user', error);
}

export async function unfollowUser(userId: string): Promise<void> {
  const { error } = await getSupabase().rpc('unfollow_user', { p_user_id: userId });
  if (error) throw dbError('unfollow_user', error);
}

export async function createFriendInvite(): Promise<FriendInvite> {
  const { data, error } = await getSupabase().rpc('create_friend_invite');
  if (error) throw dbError('create_friend_invite', error);
  return parseResponse('create_friend_invite', friendInviteSchema, data);
}

export async function redeemFriendInvite(code: string): Promise<RedeemedInvite> {
  const { data, error } = await getSupabase().rpc('redeem_friend_invite', { p_code: code });
  if (error) throw dbError('redeem_friend_invite', error);
  return parseResponse('redeem_friend_invite', redeemedInviteSchema, data);
}

/** My invites that nobody has used yet and that have not expired (RLS limits rows to my own). */
export async function fetchOpenInvites(now: Date): Promise<OpenInvite[]> {
  const { data, error } = await getSupabase()
    .from('friend_invites')
    .select('code, expires_at, created_at')
    .is('redeemed_by', null)
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw dbError('friend_invites.select', error);
  return parseResponse('friend_invites.select', z.array(openInviteSchema), data);
}

/**
 * Withdraws an unused invite so its link stops working. Resolves to false when there was nothing to
 * withdraw, for example because a friend redeemed the invite a moment earlier.
 */
export async function revokeInvite(code: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('friend_invites')
    .delete()
    .eq('code', code)
    .is('redeemed_by', null)
    .select('code');
  if (error) throw dbError('friend_invites.delete', error);
  return (data ?? []).length > 0;
}
