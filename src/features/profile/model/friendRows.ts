/**
 * Flattens follow groups and suggestions into the rows of the Friends list.
 */
import type { ConnectionGroups, Person, Suggestion } from './connections';

export type Relation = 'friend' | 'follower' | 'following' | 'suggested';

export type FriendRow =
  | { type: 'section'; key: string; title: string; count: number | null }
  | { type: 'person'; key: string; person: Person; relation: Relation; detail: string | null }
  | { type: 'note'; key: string; message: string };

function people(
  section: string,
  list: readonly Person[],
  relation: Relation,
  detail: (person: Person) => string | null = () => null,
): FriendRow[] {
  return list.map((person) => ({
    type: 'person' as const,
    key: `${section}:${person.id}`,
    person,
    relation,
    detail: detail(person),
  }));
}

export function buildFriendRows(
  groups: ConnectionGroups,
  suggestions: readonly Suggestion[],
): FriendRow[] {
  const rows: FriendRow[] = [
    { type: 'section', key: 'friends', title: 'Friends', count: groups.friends.length },
  ];
  if (groups.friends.length === 0) {
    rows.push({
      type: 'note',
      key: 'friends:none',
      message:
        'Friends are people you follow who follow you back. Share an invite link to connect in one tap.',
    });
  } else {
    rows.push(...people('friends', groups.friends, 'friend'));
  }

  if (groups.followers.length > 0) {
    rows.push({
      type: 'section',
      key: 'followers',
      title: 'Follows you',
      count: groups.followers.length,
    });
    rows.push(...people('followers', groups.followers, 'follower'));
  }

  if (groups.following.length > 0) {
    rows.push({
      type: 'section',
      key: 'following',
      title: 'Following',
      count: groups.following.length,
    });
    rows.push(...people('following', groups.following, 'following'));
  }

  if (suggestions.length > 0) {
    const reasons = new Map(suggestions.map((s) => [s.person.id, s.reason]));
    rows.push({ type: 'section', key: 'suggested', title: 'People to follow', count: null });
    rows.push(
      ...people(
        'suggested',
        suggestions.map((s) => s.person),
        'suggested',
        (person) => reasons.get(person.id) ?? null,
      ),
    );
  }
  return rows;
}

export interface FollowAction {
  label: string;
  /** What pressing does: follow or unfollow. */
  follow: boolean;
  /** Unfollowing a friend ends the friendship, so it asks first. */
  confirm: string | null;
  variant: 'primary' | 'secondary';
}

export function followActionFor(relation: Relation, person: Person): FollowAction {
  switch (relation) {
    case 'friend':
      return {
        label: 'Friends',
        follow: false,
        confirm: `Unfollow ${person.displayName}? You will no longer be friends.`,
        variant: 'secondary',
      };
    case 'following':
      return {
        label: 'Following',
        follow: false,
        confirm: `Unfollow ${person.displayName}?`,
        variant: 'secondary',
      };
    case 'follower':
      return { label: 'Follow back', follow: true, confirm: null, variant: 'primary' };
    case 'suggested':
      return { label: 'Follow', follow: true, confirm: null, variant: 'primary' };
  }
}
