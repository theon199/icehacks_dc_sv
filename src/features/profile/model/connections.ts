/**
 * Follow relationships, grouped the way the Friends screen shows them, and follow suggestions.
 *
 * Friends are people who follow each other. Following needs no approval, so one-way follows in
 * either direction are listed separately.
 */

export interface Person {
  id: string;
  handle: string;
  displayName: string;
  avatarPath: string | null;
  isTeam: boolean;
}

export interface ConnectionGroups {
  /** Mutual follows. */
  friends: Person[];
  /** People who follow me and whom I do not follow back. */
  followers: Person[];
  /** People I follow who do not follow me back. */
  following: Person[];
  /** Everyone I follow, for quick "am I following?" checks. */
  followingIds: ReadonlySet<string>;
}

function byName(a: Person, b: Person): number {
  return (
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }) ||
    a.handle.localeCompare(b.handle)
  );
}

function unique(people: readonly Person[]): Person[] {
  const seen = new Map<string, Person>();
  for (const person of people) if (!seen.has(person.id)) seen.set(person.id, person);
  return [...seen.values()];
}

export function groupConnections(
  following: readonly Person[],
  followers: readonly Person[],
): ConnectionGroups {
  const followingList = unique(following);
  const followerList = unique(followers);
  const followingIds = new Set(followingList.map((p) => p.id));
  const followerIds = new Set(followerList.map((p) => p.id));
  return {
    friends: followingList.filter((p) => followerIds.has(p.id)).sort(byName),
    followers: followerList.filter((p) => !followingIds.has(p.id)).sort(byName),
    following: followingList.filter((p) => !followerIds.has(p.id)).sort(byName),
    followingIds,
  };
}

/** A follow edge one step away: someone I follow (`via`) follows `person`. */
export interface SecondDegreeEdge {
  via: string;
  person: Person;
}

export interface Suggestion {
  person: Person;
  /** Why it is suggested, ready to show under the name. */
  reason: string;
  /** How many people I follow also follow them. */
  mutualCount: number;
}

export interface SuggestionInput {
  myId: string;
  groups: ConnectionGroups;
  secondDegree: readonly SecondDegreeEdge[];
  /** People recently active in the community, used when the follow graph is thin. */
  activeCooks: readonly Person[];
  limit?: number;
}

/**
 * Ranks people to follow: first those followed by several people I follow, then active cooks.
 * Leaves out me, anyone I already follow, people already following me (they are listed with a
 * follow-back button), and Famara Team accounts among the active cooks so real members come first.
 */
export function rankSuggestions({
  myId,
  groups,
  secondDegree,
  activeCooks,
  limit = 10,
}: SuggestionInput): Suggestion[] {
  const excluded = new Set<string>([myId, ...groups.followingIds]);
  for (const person of groups.followers) excluded.add(person.id);

  const mutuals = new Map<string, { person: Person; via: Set<string> }>();
  for (const edge of secondDegree) {
    if (excluded.has(edge.person.id) || edge.via === edge.person.id) continue;
    const entry = mutuals.get(edge.person.id) ?? { person: edge.person, via: new Set<string>() };
    entry.via.add(edge.via);
    mutuals.set(edge.person.id, entry);
  }

  const fromGraph: Suggestion[] = [...mutuals.values()]
    .map(({ person, via }) => ({
      person,
      mutualCount: via.size,
      reason:
        via.size === 1
          ? 'Followed by someone you follow'
          : `Followed by ${via.size} people you follow`,
    }))
    .sort((a, b) => b.mutualCount - a.mutualCount || byName(a.person, b.person));

  const suggested = new Set(fromGraph.map((s) => s.person.id));
  const fromActivity: Suggestion[] = [];
  for (const person of activeCooks) {
    if (excluded.has(person.id) || suggested.has(person.id) || person.isTeam) continue;
    suggested.add(person.id);
    fromActivity.push({ person, mutualCount: 0, reason: 'Recently shared a dish' });
  }

  return [...fromGraph, ...fromActivity].slice(0, Math.max(0, limit));
}
