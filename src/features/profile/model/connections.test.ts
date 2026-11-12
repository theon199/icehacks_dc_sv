import { applyFollowChange, groupConnections, rankSuggestions, type Person } from './connections';

const person = (id: string, displayName = id, isTeam = false): Person => ({
  id,
  handle: `${id}_h`,
  displayName,
  avatarPath: null,
  isTeam,
});

const ana = person('ana', 'Ana');
const ben = person('ben', 'Ben');
const cy = person('cy', 'Cy');
const dee = person('dee', 'Dee');
const eve = person('eve', 'Eve');
const fay = person('fay', 'Fay');
const team = person('team', 'Famara Team', true);

describe('groupConnections', () => {
  const groups = groupConnections([ben, ana, cy, ana], [cy, ana, dee]);

  it('treats mutual follows as friends, sorted by name', () => {
    expect(groups.friends.map((p) => p.id)).toEqual(['ana', 'cy']);
  });

  it('lists one-way follows in each direction', () => {
    expect(groups.following.map((p) => p.id)).toEqual(['ben']);
    expect(groups.followers.map((p) => p.id)).toEqual(['dee']);
  });

  it('remembers everyone I follow', () => {
    expect([...groups.followingIds].sort()).toEqual(['ana', 'ben', 'cy']);
  });

  it('handles no connections', () => {
    expect(groupConnections([], [])).toMatchObject({ friends: [], followers: [], following: [] });
  });
});

describe('rankSuggestions', () => {
  const groups = groupConnections([ana, ben], [dee]);

  it('ranks people followed by more of my follows first', () => {
    const suggestions = rankSuggestions({
      myId: 'me',
      groups,
      secondDegree: [
        { via: 'ana', person: eve },
        { via: 'ana', person: fay },
        { via: 'ben', person: fay },
        { via: 'ben', person: fay },
      ],
      activeCooks: [],
    });
    expect(suggestions.map((s) => [s.person.id, s.mutualCount, s.reason])).toEqual([
      ['fay', 2, 'Followed by 2 people you follow'],
      ['eve', 1, 'Followed by someone you follow'],
    ]);
  });

  it('leaves out me, people I follow and people waiting for a follow back', () => {
    const suggestions = rankSuggestions({
      myId: 'me',
      groups,
      secondDegree: [
        { via: 'ana', person: person('me') },
        { via: 'ana', person: ben },
        { via: 'ana', person: dee },
      ],
      activeCooks: [ana, dee, person('me')],
    });
    expect(suggestions).toEqual([]);
  });

  it('fills up with active cooks, skipping team accounts and duplicates', () => {
    const suggestions = rankSuggestions({
      myId: 'me',
      groups,
      secondDegree: [{ via: 'ana', person: eve }],
      activeCooks: [team, eve, cy, cy],
    });
    expect(suggestions.map((s) => [s.person.id, s.reason])).toEqual([
      ['eve', 'Followed by someone you follow'],
      ['cy', 'Recently shared a dish'],
    ]);
  });

  it('respects the limit', () => {
    const suggestions = rankSuggestions({
      myId: 'me',
      groups,
      secondDegree: [],
      activeCooks: [cy, eve, fay],
      limit: 2,
    });
    expect(suggestions).toHaveLength(2);
  });
});

describe('applyFollowChange', () => {
  const me = (id: string): Person => ({
    id,
    handle: id,
    displayName: id,
    avatarPath: null,
    isTeam: false,
  });
  const lists = { following: [me('ana')], followers: [me('cy')] };

  it('adds a newly followed person at the top', () => {
    expect(applyFollowChange(lists, me('cy'), true).following.map((p) => p.id)).toEqual([
      'cy',
      'ana',
    ]);
  });

  it('removes an unfollowed person and leaves followers alone', () => {
    const next = applyFollowChange(lists, me('ana'), false);
    expect(next.following).toEqual([]);
    expect(next.followers).toBe(lists.followers);
  });

  it('returns the same lists when nothing changes', () => {
    expect(applyFollowChange(lists, me('ana'), true)).toBe(lists);
    expect(applyFollowChange(lists, me('ben'), false)).toBe(lists);
  });
});
