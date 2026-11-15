import { claimedCount, nextClaimTarget, regionProgress, type ClaimRegion } from './progress';

function region(
  id: string,
  name: string,
  done: number,
  visits: readonly number[],
  claimed = false,
): ClaimRegion {
  return {
    id,
    name,
    progress: {
      done,
      total: visits.length,
      claimed,
      claimedAt: claimed ? '2026-11-01T18:00:00Z' : null,
    },
    spotsStatus: 'ready',
    spots: visits.map((count, i) => ({
      placeId: `${id}-p${i + 1}`,
      name: `${name} spot ${i + 1}`,
      rank: i + 1,
      visits: count,
    })),
  };
}

describe('regionProgress', () => {
  it('adds remaining spots and a fraction', () => {
    expect(regionProgress({ done: 2, total: 3, claimed: false, claimedAt: null })).toEqual({
      done: 2,
      total: 3,
      remaining: 1,
      fraction: 2 / 3,
      claimed: false,
      claimedAt: null,
    });
  });

  it('keeps a claim complete even when the spot list grew', () => {
    const at = '2026-10-02T09:30:00Z';
    expect(regionProgress({ done: 3, total: 5, claimed: true, claimedAt: at })).toEqual({
      done: 3,
      total: 5,
      remaining: 0,
      fraction: 1,
      claimed: true,
      claimedAt: at,
    });
  });

  it('clamps odd counts', () => {
    expect(regionProgress({ done: 7, total: 3, claimed: false, claimedAt: null })).toMatchObject({
      done: 3,
      remaining: 0,
      fraction: 1,
    });
    expect(regionProgress({ done: -1, total: 2.5, claimed: false, claimedAt: null })).toMatchObject(
      { done: 0, total: 2, remaining: 2 },
    );
    expect(regionProgress({ done: 0, total: 0, claimed: false, claimedAt: null })).toMatchObject({
      remaining: 0,
      fraction: 0,
    });
  });

  it('drops a claim time on an unclaimed region', () => {
    const progress = regionProgress({ done: 1, total: 3, claimed: false, claimedAt: 'x' });
    expect(progress.claimedAt).toBeNull();
  });
});

describe('nextClaimTarget', () => {
  it('picks the region with the fewest spots left and its best unvisited spot', () => {
    const target = nextClaimTarget([
      region('a', 'Ocean Park', 1, [1, 0, 0, 0]),
      region('b', 'Main Street', 2, [2, 0, 1, 0]),
      region('c', 'Pico', 0, [0, 0, 0, 0, 0]),
    ]);
    expect(target?.region.id).toBe('b');
    expect(target?.spot.placeId).toBe('b-p2');
    expect(target?.remaining).toBe(2);
  });

  it('breaks ties on more done, then on name', () => {
    const moreDone = nextClaimTarget([
      region('a', 'Alpha', 0, [0]),
      region('b', 'Beta', 2, [1, 1, 0]),
    ]);
    expect(moreDone?.region.id).toBe('b');

    const byName = nextClaimTarget([
      region('z', 'Venice', 1, [1, 0]),
      region('y', 'Mar Vista', 1, [0, 1]),
    ]);
    expect(byName?.region.id).toBe('y');
    expect(byName?.spot.placeId).toBe('y-p1');
  });

  it('prefers the lowest rank among unvisited spots, whatever the list order', () => {
    const r = region('a', 'Ocean Park', 0, [0, 0, 0]);
    const shuffled: ClaimRegion = { ...r, spots: [...r.spots].reverse() };
    expect(nextClaimTarget([shuffled])?.spot.rank).toBe(1);
  });

  it('skips claimed regions and regions with nothing left to visit', () => {
    expect(
      nextClaimTarget([
        region('a', 'Claimed', 3, [1, 1, 1], true),
        region('b', 'Claimed early', 2, [1, 1, 0], true),
        region('c', 'No spots yet', 0, []),
        region('d', 'Stale count', 1, [1, 1]),
      ]),
    ).toBeNull();
    expect(nextClaimTarget([])).toBeNull();
  });

  it('skips regions whose spots are not ready', () => {
    const closest = region('a', 'Ocean Park', 2, [1, 1, 0]);
    const later = region('b', 'Pico', 0, [0, 0, 0]);
    expect(nextClaimTarget([{ ...closest, spotsStatus: 'pending' }, later])?.region.id).toBe('b');
    expect(nextClaimTarget([{ ...closest, spotsStatus: 'unavailable' }])).toBeNull();
  });

  it('returns the caller’s own region type', () => {
    const regions = [{ ...region('a', 'Ocean Park', 0, [0]), colour: 'teal' }];
    expect(nextClaimTarget(regions)?.region.colour).toBe('teal');
  });
});

describe('claimedCount', () => {
  it('counts claimed regions', () => {
    expect(
      claimedCount([
        region('a', 'A', 1, [1], true),
        region('b', 'B', 0, [0]),
        region('c', 'C', 2, [1, 1, 0], true),
      ]),
    ).toBe(2);
    expect(claimedCount([])).toBe(0);
  });
});
