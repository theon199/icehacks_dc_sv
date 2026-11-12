import { groupConnections, type Person } from './connections';
import { buildFriendRows, followActionFor } from './friendRows';

const person = (id: string): Person => ({
  id,
  handle: id,
  displayName: id.toUpperCase(),
  avatarPath: null,
  isTeam: false,
});

describe('buildFriendRows', () => {
  it('explains friends when there are none and hides empty sections', () => {
    const rows = buildFriendRows(groupConnections([], []), []);
    expect(rows.map((r) => r.type)).toEqual(['section', 'note']);
    expect(rows[1]).toMatchObject({ message: expect.stringMatching(/invite link/) });
  });

  it('lists each group under its own heading', () => {
    const groups = groupConnections([person('a'), person('b')], [person('a'), person('c')]);
    const rows = buildFriendRows(groups, [
      { person: person('d'), reason: 'Recently shared a dish', mutualCount: 0 },
    ]);
    expect(rows.map((r) => (r.type === 'person' ? `${r.relation}:${r.person.id}` : r.key))).toEqual(
      [
        'friends',
        'friend:a',
        'followers',
        'follower:c',
        'following',
        'following:b',
        'suggested',
        'suggested:d',
      ],
    );
    expect(rows.find((r) => r.key === 'suggested:d')).toMatchObject({
      detail: 'Recently shared a dish',
    });
  });

  it('keeps keys unique', () => {
    const groups = groupConnections([person('a')], [person('a')]);
    const keys = buildFriendRows(groups, []).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('followActionFor', () => {
  it('asks before ending a friendship', () => {
    expect(followActionFor('friend', person('ana'))).toMatchObject({
      follow: false,
      confirm: expect.stringMatching(/no longer be friends/),
    });
  });

  it('offers to follow back and to follow suggestions without asking', () => {
    expect(followActionFor('follower', person('a'))).toMatchObject({
      label: 'Follow back',
      follow: true,
      confirm: null,
    });
    expect(followActionFor('suggested', person('a')).label).toBe('Follow');
  });
});
