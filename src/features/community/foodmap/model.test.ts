import type { FoodMapResponse, FoodRegion, FoodSpot } from '@/lib/api/foodMap';

import {
  badgesFor,
  buildFoodMapView,
  firstClaim,
  placeKindLabel,
  regionFillOpacity,
} from './model';

const NOW = new Date('2026-11-15T12:00:00Z');

/** A square region around a centre, `half` degrees each way. */
function square(lng: number, lat: number, half: number): FoodRegion['polygon'] {
  return [
    [
      [lng - half, lat - half],
      [lng + half, lat - half],
      [lng + half, lat + half],
      [lng - half, lat + half],
      [lng - half, lat - half],
    ],
  ];
}

function spot(overrides: Partial<FoodSpot> & Pick<FoodSpot, 'placeId'>): FoodSpot {
  return {
    name: overrides.placeId,
    lat: 34.01,
    lng: -118.49,
    primaryType: 'vietnamese_restaurant',
    rank: 1,
    visits: 0,
    photos: [],
    ...overrides,
  };
}

function region(overrides: Partial<FoodRegion> & Pick<FoodRegion, 'id' | 'name'>): FoodRegion {
  const half = 0.01;
  return {
    source: 'osm',
    polygon: square(-118.49, 34.01, half),
    bbox: [-118.49 - half, 34.01 - half, -118.49 + half, 34.01 + half],
    progress: { done: 0, total: 0, claimed: false, claimedAt: null },
    spotsStatus: 'ready',
    spots: [],
    ...overrides,
  };
}

function response(overrides: Partial<FoodMapResponse> = {}): FoodMapResponse {
  return {
    configured: true,
    notice: null,
    attribution: { osm: true, google: true },
    regions: [],
    checkIns: [],
    totals: { checkIns: 0, places: 0, claimed: 0 },
    ...overrides,
  };
}

const ORIGIN = { lat: 34.01, lng: -118.49 };

describe('placeKindLabel', () => {
  it('turns a Google type into a short label', () => {
    expect(placeKindLabel('vietnamese_restaurant')).toBe('Vietnamese');
    expect(placeKindLabel('salad_shop')).toBe('Salad shop');
    expect(placeKindLabel('restaurant')).toBe('Restaurant');
    expect(placeKindLabel(null)).toBeNull();
  });
});

describe('buildFoodMapView', () => {
  it('labels regions by their state', () => {
    const view = buildFoodMapView({
      response: response({
        regions: [
          region({
            id: 'a',
            name: 'Claimed one',
            progress: { done: 3, total: 3, claimed: true, claimedAt: '2026-10-03T10:00:00Z' },
          }),
          region({
            id: 'b',
            name: 'Started',
            progress: { done: 2, total: 5, claimed: false, claimedAt: null },
          }),
          region({
            id: 'c',
            name: 'Open',
            progress: { done: 0, total: 4, claimed: false, claimedAt: null },
          }),
          region({ id: 'd', name: 'No spots' }),
        ],
      }),
      origin: ORIGIN,
      now: NOW,
    });

    expect(view.regions.map((r) => [r.state, r.label])).toEqual([
      ['claimed', 'Claimed'],
      ['started', '2 of 5'],
      ['open', '0 of 4'],
      ['empty', null],
    ]);
    expect(view.claimedHere).toBe(1);
    // A region with no spots is not one to claim.
    expect(view.claimable.map((r) => r.name)).toEqual(['Claimed one', 'Started', 'Open']);
  });

  it('lists each spot once, under its smallest region, nearest first', () => {
    const shared = spot({ placeId: 'shared', lat: 34.012, lng: -118.49 });
    const near = spot({ placeId: 'near', lat: 34.0101, lng: -118.49 });
    const view = buildFoodMapView({
      response: response({
        regions: [
          region({
            id: 'big',
            name: 'Big',
            bbox: [-118.6, 33.9, -118.4, 34.1],
            polygon: square(-118.5, 34, 0.1),
            spots: [shared],
          }),
          region({ id: 'small', name: 'Small', spots: [shared, near] }),
        ],
      }),
      origin: ORIGIN,
      now: NOW,
    });

    expect(view.spots.map((s) => [s.placeId, s.regionName])).toEqual([
      ['near', 'Small'],
      ['shared', 'Small'],
    ]);
    expect(view.spots[0]?.kind).toBe('Vietnamese');
    expect(view.spots[0]?.distanceM).toBeLessThan(20);
  });

  it('leaves out spots of regions that are not ready and says why', () => {
    const view = buildFoodMapView({
      response: response({
        configured: false,
        regions: [
          region({
            id: 'a',
            name: 'A',
            spotsStatus: 'unavailable',
            spots: [spot({ placeId: 'x' })],
          }),
        ],
      }),
      origin: null,
      now: NOW,
    });

    expect(view.spots).toEqual([]);
    expect(view.spotsUnavailable).toBe(true);
    expect(view.spotsPending).toBe(false);
  });

  it('draws only check-ins whose place still has a position', () => {
    const view = buildFoodMapView({
      response: response({
        checkIns: [
          {
            placeId: 'p1',
            placeName: 'One',
            lat: 34,
            lng: -118,
            regionId: null,
            healthy: true,
            visits: 2,
            times: [],
          },
          {
            placeId: 'p2',
            placeName: null,
            lat: null,
            lng: null,
            regionId: null,
            healthy: true,
            visits: 1,
            times: [],
          },
        ],
      }),
      origin: ORIGIN,
      now: NOW,
    });

    expect(view.dots).toEqual([
      { placeId: 'p1', point: { latitude: 34, longitude: -118 }, visits: 2 },
    ]);
  });

  it('aims at the region closest to a claim', () => {
    const view = buildFoodMapView({
      response: response({
        regions: [
          region({
            id: 'far',
            name: 'Far',
            progress: { done: 0, total: 4, claimed: false, claimedAt: null },
            spots: [spot({ placeId: 'f1' })],
          }),
          region({
            id: 'close',
            name: 'Close',
            progress: { done: 2, total: 3, claimed: false, claimedAt: null },
            spots: [spot({ placeId: 'c1', visits: 1 }), spot({ placeId: 'c2', rank: 2 })],
          }),
        ],
      }),
      origin: ORIGIN,
      now: NOW,
    });

    expect(view.target).toEqual({ regionName: 'Close', remaining: 1, placeId: 'c2' });
  });

  it('warms a region with recent check-ins', () => {
    const view = buildFoodMapView({
      response: response({
        regions: [
          region({
            id: 'a',
            name: 'A',
            progress: { done: 1, total: 4, claimed: false, claimedAt: null },
          }),
        ],
        checkIns: [
          {
            placeId: 'p',
            placeName: 'P',
            lat: 34.01,
            lng: -118.49,
            regionId: 'a',
            healthy: true,
            visits: 2,
            times: ['2026-11-14T12:00:00Z', '2026-11-10T12:00:00Z'],
          },
        ],
      }),
      origin: ORIGIN,
      now: NOW,
    });

    expect(view.regions[0]?.shade).toBe(2);
    expect(view.regions[0]?.coolsInDays).toBeGreaterThan(0);
  });
});

describe('regionFillOpacity', () => {
  const progress = {
    done: 0,
    total: 4,
    remaining: 4,
    fraction: 0,
    claimed: false,
    claimedAt: null,
  };

  it('fills a claimed region solidly and leaves an untouched one clear', () => {
    expect(regionFillOpacity({ state: 'claimed', progress, shade: 0 })).toBe(0.38);
    expect(regionFillOpacity({ state: 'open', progress, shade: 0 })).toBe(0);
  });

  it('tints by progress and heat, up to a cap', () => {
    const half = { ...progress, done: 2, remaining: 2, fraction: 0.5 };
    expect(regionFillOpacity({ state: 'started', progress: half, shade: 0 })).toBeCloseTo(0.09);
    expect(regionFillOpacity({ state: 'started', progress: half, shade: 4 })).toBeCloseTo(0.29);
    expect(
      regionFillOpacity({ state: 'started', progress: { ...half, fraction: 1 }, shade: 4 }),
    ).toBe(0.3);
  });
});

describe('badges', () => {
  const day = (iso: string) => iso.slice(0, 10);

  it('earns badges from the server totals', () => {
    const badges = badgesFor(
      { checkIns: 14, places: 11, claimed: 1 },
      { regionName: 'Pico', at: '2026-10-03T10:00:00Z' },
      day,
    );
    expect(badges.map((b) => [b.title, b.earned, b.detail])).toEqual([
      ['First check-in', true, '14 so far'],
      ['First claim', true, 'Pico, 2026-10-03'],
      ['Ten places', true, '10 of 10'],
      ['Claim 3 regions', false, '1 of 3'],
    ]);
  });

  it('names the first claim only when every claim is on this map', () => {
    const claimed = buildFoodMapView({
      response: response({
        totals: { checkIns: 6, places: 3, claimed: 2 },
        regions: [
          region({
            id: 'a',
            name: 'A',
            progress: { done: 3, total: 3, claimed: true, claimedAt: '2026-10-05T00:00:00Z' },
          }),
        ],
      }),
      origin: null,
      now: NOW,
    });
    expect(firstClaim(claimed)).toBeNull();

    const all = { ...claimed, totals: { ...claimed.totals, claimed: 1 } };
    expect(firstClaim(all)).toEqual({ regionName: 'A', at: '2026-10-05T00:00:00Z' });
  });
});
