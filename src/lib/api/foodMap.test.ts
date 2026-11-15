import { drawableCheckIns, nextClaimTarget, regionCheckInTimes } from '@/domain/foodmap';

import type * as clientModule from './client';
import { callFunction, createApiClient } from './client';
import { ApiError } from './errors';
import {
  checkInAtPlace,
  checkInRejection,
  checkInResponseSchema,
  fetchFoodMap,
  fetchPlacePhoto,
  foodMapPending,
  foodMapResponseSchema,
  isPlacePhotoQuotaExceeded,
  isPlacePhotoUnavailable,
  placePhotoResponseSchema,
} from './foodMap';

jest.mock('./client', () => ({
  ...jest.requireActual<typeof clientModule>('./client'),
  callFunction: jest.fn(),
}));

const mockedCall = jest.mocked(callFunction);

beforeEach(() => {
  mockedCall.mockReset();
  mockedCall.mockResolvedValue(undefined);
});

function lastCall() {
  const [name, input, , options] = mockedCall.mock.calls.at(-1) ?? [];
  return { name, input, options };
}

/** Routes `callFunction` through the real client, answering every request with this reply. */
function serverReplies(body: unknown, status: number, headers: Record<string, string> = {}) {
  const call = createApiClient({
    baseUrl: 'https://proj.supabase.co',
    publishableKey: 'sb_publishable_key',
    getAccessToken: async () => 'user-token',
    fetch: async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      }),
  });
  mockedCall.mockImplementation((name, input, schema, options) =>
    call(name, input, schema, options),
  );
}

async function failureOf(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => {
      throw new Error('expected the call to fail');
    },
    (error: unknown) => error,
  );
}

const REGION_ID = '5b6a3c1e-8f4d-4c2a-9e7b-1d2f3a4b5c6d';
const OTHER_REGION_ID = '0f9e8d7c-6b5a-4f3e-8d2c-1b0a9f8e7d6c';

const ring = [
  [-118.4823, 34.0003],
  [-118.4557, 34.0003],
  [-118.4557, 34.0151],
  [-118.4823, 34.0151],
  [-118.4823, 34.0003],
];

function wireRegion(overrides: Record<string, unknown> = {}) {
  return {
    id: REGION_ID,
    source: 'osm',
    name: 'Ocean Park',
    polygon: [ring],
    bbox: [-118.4823, 34.0003, -118.4557, 34.0151],
    progress: { done: 1, total: 2, claimed: false, claimed_at: null },
    spots_status: 'ready',
    spots: [
      {
        place_id: 'ChIJbayStreetBowls',
        name: 'Bay Street Bowls',
        lat: 34.0071,
        lng: -118.4702,
        primary_type: 'salad_shop',
        rank: 1,
        visits: 2,
        photos: [
          {
            name: 'places/ChIJbayStreetBowls/photos/AbC123',
            width: 1200,
            height: 900,
            attributions: [
              { display_name: 'Ana R.', uri: 'https://maps.google.com/maps/contrib/1' },
              { display_name: 'Sam T.', uri: null },
            ],
          },
        ],
      },
      {
        place_id: 'ChIJpicoPho',
        name: 'Pico Pho',
        lat: 34.0102,
        lng: -118.4651,
        primary_type: null,
        rank: 2,
        visits: 0,
        photos: [],
      },
    ],
    ...overrides,
  };
}

function wireMap(overrides: Record<string, unknown> = {}) {
  return {
    configured: true,
    notice: null,
    attribution: { osm: true, google: true },
    regions: [wireRegion()],
    check_ins: [
      {
        place_id: 'ChIJbayStreetBowls',
        place_name: 'Bay Street Bowls',
        lat: 34.0071,
        lng: -118.4702,
        region_id: REGION_ID,
        healthy: true,
        visits: 2,
        times: ['2026-11-09T19:12:00Z', '2026-10-30T12:01:44.123456+00:00'],
      },
    ],
    totals: { check_ins: 34, places: 11, claimed: 2 },
    ...overrides,
  };
}

describe('fetchFoodMap', () => {
  it('sends the validated position to the food-map function', async () => {
    const signal = new AbortController().signal;
    await fetchFoodMap({ lat: 34.0071, lng: -118.4702 }, { signal });
    expect(lastCall()).toEqual({
      name: 'food-map',
      input: { lat: 34.0071, lng: -118.4702 },
      options: { signal },
    });
  });

  it('rejects an impossible position before calling the server', () => {
    expect(() => fetchFoodMap({ lat: 91, lng: 0 })).toThrow();
    expect(() => fetchFoodMap({ lat: 0, lng: Number.NaN })).toThrow();
    expect(mockedCall).not.toHaveBeenCalled();
  });

  it('parses a full response into camelCase', () => {
    const map = foodMapResponseSchema.parse(wireMap());
    expect(map).toMatchObject({
      configured: true,
      notice: null,
      attribution: { osm: true, google: true },
      totals: { checkIns: 34, places: 11, claimed: 2 },
    });
    const region = map.regions[0]!;
    expect(region).toMatchObject({
      id: REGION_ID,
      source: 'osm',
      name: 'Ocean Park',
      bbox: [-118.4823, 34.0003, -118.4557, 34.0151],
      progress: { done: 1, total: 2, claimed: false, claimedAt: null },
      spotsStatus: 'ready',
    });
    expect(region.polygon[0]).toHaveLength(5);
    expect(region.spots[0]).toMatchObject({
      placeId: 'ChIJbayStreetBowls',
      primaryType: 'salad_shop',
      visits: 2,
      photos: [
        {
          name: 'places/ChIJbayStreetBowls/photos/AbC123',
          attributions: [
            { displayName: 'Ana R.', uri: 'https://maps.google.com/maps/contrib/1' },
            { displayName: 'Sam T.', uri: null },
          ],
        },
      ],
    });
    expect(map.checkIns[0]).toMatchObject({
      placeId: 'ChIJbayStreetBowls',
      placeName: 'Bay Street Bowls',
      regionId: REGION_ID,
      visits: 2,
      times: ['2026-11-09T19:12:00Z', '2026-10-30T12:01:44.123456+00:00'],
    });
  });

  it('feeds the domain claim rules directly', () => {
    const map = foodMapResponseSchema.parse(wireMap());
    expect(nextClaimTarget(map.regions)?.spot.placeId).toBe('ChIJpicoPho');
  });

  it('parses a configured: false response with regions but no spots', () => {
    const map = foodMapResponseSchema.parse(
      wireMap({
        configured: false,
        attribution: { osm: true, google: false },
        regions: [
          wireRegion({
            progress: { done: 0, total: 0, claimed: false, claimed_at: null },
            spots_status: 'unavailable',
            spots: [],
          }),
        ],
        check_ins: [],
        totals: { check_ins: 0, places: 0, claimed: 0 },
      }),
    );
    expect(map.configured).toBe(false);
    expect(map.attribution.google).toBe(false);
    expect(map.regions[0]?.spots).toEqual([]);
    expect(map.regions[0]?.spotsStatus).toBe('unavailable');
    expect(nextClaimTarget(map.regions)).toBeNull();
  });

  it('parses a budget notice with no regions', () => {
    const map = foodMapResponseSchema.parse(wireMap({ notice: 'budget', regions: [] }));
    expect(map).toMatchObject({ notice: 'budget', regions: [] });
  });

  it('does not target a region whose spots are still pending', () => {
    const map = foodMapResponseSchema.parse(
      wireMap({ regions: [wireRegion({ spots_status: 'pending' })] }),
    );
    expect(map.regions[0]?.spotsStatus).toBe('pending');
    expect(nextClaimTarget(map.regions)).toBeNull();
  });

  it('keeps a check-in whose place details expired: not drawn, still warm', () => {
    const expired = {
      place_id: 'ChIJpicoPho',
      place_name: null,
      lat: null,
      lng: null,
      region_id: REGION_ID,
      healthy: true,
      visits: 1,
      times: ['2026-09-01T18:00:00Z'],
    };
    const map = foodMapResponseSchema.parse(
      wireMap({ check_ins: [...wireMap().check_ins, expired] }),
    );
    expect(map.checkIns[1]).toMatchObject({ placeName: null, lat: null, lng: null, visits: 1 });
    expect(drawableCheckIns(map.checkIns).map((c) => c.placeId)).toEqual(['ChIJbayStreetBowls']);
    expect(regionCheckInTimes(map.checkIns, REGION_ID)).toContain('2026-09-01T18:00:00Z');
  });

  it('keeps a claimed region and the budget notice', () => {
    const map = foodMapResponseSchema.parse(
      wireMap({
        notice: 'budget',
        regions: [
          wireRegion({
            id: OTHER_REGION_ID,
            source: 'grid',
            progress: { done: 2, total: 2, claimed: true, claimed_at: '2026-11-02T18:40:00Z' },
          }),
        ],
      }),
    );
    expect(map.notice).toBe('budget');
    expect(map.regions[0]?.progress).toEqual({
      done: 2,
      total: 2,
      claimed: true,
      claimedAt: '2026-11-02T18:40:00Z',
    });
  });

  it('drops attribution links that are not https rather than failing the map', () => {
    const region = wireRegion();
    region.spots[0]!.photos[0]!.attributions[0]!.uri = 'javascript:alert(1)';
    const map = foodMapResponseSchema.parse(wireMap({ regions: [region] }));
    expect(map.regions[0]?.spots[0]?.photos[0]?.attributions[0]).toEqual({
      displayName: 'Ana R.',
      uri: null,
    });
  });

  it.each([
    ['a missing totals block', wireMap({ totals: undefined })],
    ['an unknown region source', wireMap({ regions: [wireRegion({ source: 'osm2' })] })],
    [
      'a ring that is not closed',
      wireMap({ regions: [wireRegion({ polygon: [ring.slice(0, 4)] })] }),
    ],
    [
      'a ring with too few points',
      wireMap({ regions: [wireRegion({ polygon: [[ring[0], ring[1], ring[0]]] })] }),
    ],
    ['a position out of range', wireMap({ regions: [wireRegion({ bbox: [0, 95, 1, 96] })] })],
    [
      'more than five spots',
      wireMap({ regions: [wireRegion({ spots: Array(6).fill(wireRegion().spots[1]) })] }),
    ],
    ['a region id that is not a uuid', wireMap({ regions: [wireRegion({ id: 'r1' })] })],
    [
      'a check-in time that is not ISO',
      wireMap({ check_ins: [{ ...wireMap().check_ins[0], times: ['yesterday'] }] }),
    ],
    ['an unknown notice', wireMap({ notice: 'quota' })],
    ['a missing spots_status', wireMap({ regions: [wireRegion({ spots_status: undefined })] })],
    ['an unknown spots_status', wireMap({ regions: [wireRegion({ spots_status: 'later' })] })],
    [
      'a check-in with a name but no position',
      wireMap({ check_ins: [{ ...wireMap().check_ins[0], lat: null, lng: null }] }),
    ],
    [
      'a check-in with a position but no name',
      wireMap({ check_ins: [{ ...wireMap().check_ins[0], place_name: null }] }),
    ],
    [
      'a check-in without times',
      wireMap({ check_ins: [{ ...wireMap().check_ins[0], times: undefined }] }),
    ],
  ])('rejects %s', (_label, body) => {
    expect(foodMapResponseSchema.safeParse(body).success).toBe(false);
  });

  it('turns a malformed reply into an invalid_response error', async () => {
    serverReplies({ configured: true, regions: 'none' }, 200);
    const error = await failureOf(fetchFoodMap({ lat: 34, lng: -118.4 }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'server', code: 'invalid_response', retryable: false });
  });
});

describe('foodMapPending', () => {
  const fillInProgress = {
    error: {
      code: 'upstream_unavailable',
      message: 'This area is still loading. Try again.',
      details: { reason: 'area_fill_in_progress' },
    },
  };

  it('reads the Retry-After header while the area is first filled', async () => {
    serverReplies(fillInProgress, 503, { 'retry-after': '7' });
    const error = await failureOf(fetchFoodMap({ lat: 34, lng: -118.4 }));
    expect(foodMapPending(error)).toEqual({ retryAfterS: 7 });
  });

  it('waits 5 seconds when there is no header', async () => {
    serverReplies(fillInProgress, 503);
    const error = await failureOf(fetchFoodMap({ lat: 34, lng: -118.4 }));
    expect(foodMapPending(error)).toEqual({ retryAfterS: 5 });
  });

  it('is null for other failures', async () => {
    serverReplies({ error: { code: 'upstream_unavailable', message: 'Overpass is down.' } }, 503);
    const otherOutage = await failureOf(fetchFoodMap({ lat: 34, lng: -118.4 }));
    expect(foodMapPending(otherOutage)).toBeNull();
    expect(
      foodMapPending(
        new ApiError({
          kind: 'server',
          functionName: 'place-photo',
          code: 'upstream_unavailable',
          details: { reason: 'area_fill_in_progress' },
        }),
      ),
    ).toBeNull();
    expect(foodMapPending(new Error('plain'))).toBeNull();
  });
});

describe('checkInAtPlace', () => {
  it('maps the request to the wire format', async () => {
    await checkInAtPlace({ placeId: 'ChIJpicoPho', lat: 34.0101, lng: -118.4652, accuracyM: 18 });
    expect(lastCall()).toMatchObject({
      name: 'food-check-in',
      input: { place_id: 'ChIJpicoPho', lat: 34.0101, lng: -118.4652, accuracy_m: 18 },
    });
  });

  it('rejects a bad request before calling the server', () => {
    const ok = { placeId: 'ChIJpicoPho', lat: 34, lng: -118, accuracyM: 10 };
    expect(() => checkInAtPlace({ ...ok, placeId: '' })).toThrow();
    expect(() => checkInAtPlace({ ...ok, accuracyM: 1001 })).toThrow();
    expect(() => checkInAtPlace({ ...ok, accuracyM: -1 })).toThrow();
    expect(mockedCall).not.toHaveBeenCalled();
  });

  it('parses a check-in that claims a region', () => {
    expect(
      checkInResponseSchema.parse({
        visits_here: 3,
        total_check_ins: 35,
        healthy: true,
        region: { id: REGION_ID, name: 'Main Street', done: 3, total: 3, claimed: true },
        claimed_now: true,
      }),
    ).toEqual({
      visitsHere: 3,
      totalCheckIns: 35,
      healthy: true,
      region: { id: REGION_ID, name: 'Main Street', done: 3, total: 3, claimed: true },
      claimedNow: true,
    });
    expect(
      checkInResponseSchema.parse({
        visits_here: 1,
        total_check_ins: 1,
        healthy: false,
        region: null,
        claimed_now: false,
      }).region,
    ).toBeNull();
  });

  it('reads a too_far refusal', async () => {
    serverReplies(
      {
        error: {
          code: 'too_far',
          message: 'Too far from this place.',
          details: { distance_m: 340, allowed_m: 260 },
        },
      },
      422,
    );
    const error = await failureOf(
      checkInAtPlace({ placeId: 'ChIJpicoPho', lat: 34, lng: -118, accuracyM: 60 }),
    );
    expect(error).toMatchObject({ kind: 'validation', status: 422 });
    expect(checkInRejection(error)).toEqual({ reason: 'too_far', distanceM: 340, allowedM: 260 });
  });

  it.each(['cooldown', 'daily'] as const)('reads a %s rate limit', async (reason) => {
    serverReplies(
      {
        error: {
          code: 'rate_limited',
          message: 'Slow down.',
          details: { retry_at: '2026-11-14T03:40:00Z', reason },
        },
      },
      429,
      { 'retry-after': '3600' },
    );
    const error = await failureOf(
      checkInAtPlace({ placeId: 'ChIJpicoPho', lat: 34, lng: -118, accuracyM: 5 }),
    );
    expect(error).toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 3600 });
    expect(checkInRejection(error)).toEqual({
      reason: 'rate_limited',
      limit: reason,
      retryAt: '2026-11-14T03:40:00Z',
    });
  });

  it('reads a not_found refusal', async () => {
    serverReplies({ error: { code: 'not_found', message: 'Unknown place.' } }, 404);
    const error = await failureOf(
      checkInAtPlace({ placeId: 'ChIJgone', lat: 34, lng: -118, accuracyM: 5 }),
    );
    expect(checkInRejection(error)).toEqual({ reason: 'not_found' });
  });

  it('returns null for refusals it cannot explain, so the screen falls back to userMessage', async () => {
    serverReplies({ error: { code: 'too_far', details: { distance_m: 'far' } } }, 422);
    const malformed = await failureOf(
      checkInAtPlace({ placeId: 'ChIJpicoPho', lat: 34, lng: -118, accuracyM: 5 }),
    );
    expect(checkInRejection(malformed)).toBeNull();
    expect(checkInRejection(new Error('plain'))).toBeNull();
    expect(
      checkInRejection(
        new ApiError({ kind: 'server', functionName: 'food-map', code: 'not_found' }),
      ),
    ).toBeNull();
    expect(
      checkInRejection(new ApiError({ kind: 'network', functionName: 'food-check-in' })),
    ).toBeNull();
  });

  it.each([
    [503, { error: { code: 'upstream_unavailable', details: { reason: 'budget' } } }],
    [503, { error: { code: 'upstream_unavailable', message: 'Places returned an error.' } }],
    [500, { error: { code: 'internal', message: 'Something went wrong.' } }],
    [504, { error: { code: 'upstream_timeout', message: 'Places timed out.' } }],
  ])('leaves a %i to the generic message', async (status, body) => {
    serverReplies(body, status);
    const error = await failureOf(
      checkInAtPlace({ placeId: 'ChIJpicoPho', lat: 34, lng: -118, accuracyM: 5 }),
    );
    expect(error).toMatchObject({ kind: 'server', status });
    expect(checkInRejection(error)).toBeNull();
  });
});

describe('fetchPlacePhoto', () => {
  it('maps the request and parses the short-lived url', async () => {
    await fetchPlacePhoto({ photoName: 'places/ChIJpicoPho/photos/AbC123', maxWidth: 800 });
    expect(lastCall()).toMatchObject({
      name: 'place-photo',
      input: { photo_name: 'places/ChIJpicoPho/photos/AbC123', max_width: 800 },
    });
    expect(
      placePhotoResponseSchema.parse({
        url: 'https://lh3.googleusercontent.com/place-photos/abc=s800',
        expires_at: '2026-11-14T13:00:00Z',
      }),
    ).toEqual({
      url: 'https://lh3.googleusercontent.com/place-photos/abc=s800',
      expiresAt: '2026-11-14T13:00:00Z',
    });
  });

  it('rejects bad requests and non-https urls', () => {
    expect(() => fetchPlacePhoto({ photoName: 'https://evil.test/x', maxWidth: 800 })).toThrow();
    expect(() => fetchPlacePhoto({ photoName: 'places/a/photos/b', maxWidth: 2000 })).toThrow();
    expect(mockedCall).not.toHaveBeenCalled();
    expect(
      placePhotoResponseSchema.safeParse({
        url: 'http://lh3.googleusercontent.com/x',
        expires_at: '2026-11-14T13:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('recognises a missing key and the daily quota', async () => {
    const request = { photoName: 'places/ChIJpicoPho/photos/AbC123', maxWidth: 400 };
    serverReplies({ error: { code: 'upstream_unavailable', message: 'Photos are off.' } }, 503);
    const unavailable = await failureOf(fetchPlacePhoto(request));
    expect(isPlacePhotoUnavailable(unavailable)).toBe(true);
    expect(isPlacePhotoQuotaExceeded(unavailable)).toBe(false);

    serverReplies({ error: { code: 'quota_exceeded', message: 'Enough photos today.' } }, 429);
    const quota = await failureOf(fetchPlacePhoto(request));
    expect(isPlacePhotoQuotaExceeded(quota)).toBe(true);
    expect(isPlacePhotoUnavailable(new Error('plain'))).toBe(false);
  });
});
