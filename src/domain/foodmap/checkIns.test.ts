import {
  drawableCheckIns,
  isDrawableCheckIn,
  regionCheckInTimes,
  type MapCheckIn,
} from './checkIns';
import { regionHeat } from './heat';

const NOW = new Date('2026-11-14T12:00:00Z');

const fresh = {
  placeId: 'ChIJbayStreetBowls',
  placeName: 'Bay Street Bowls',
  regionId: 'r1',
  lat: 34.0071,
  lng: -118.4702,
  times: ['2026-11-14T12:00:00Z'],
};
/** Older than Google's 30-day limit: name and position gone, visits kept. */
const expired = {
  placeId: 'ChIJpicoPho',
  placeName: null,
  regionId: 'r1',
  lat: null,
  lng: null,
  times: ['2026-10-24T12:00:00Z', '2026-10-03T12:00:00Z'],
};
const elsewhere = { ...fresh, placeId: 'ChIJother', regionId: 'r2' };

describe('food map check-ins', () => {
  it('never draws a check-in without a position', () => {
    expect(isDrawableCheckIn(expired)).toBe(false);
    expect(isDrawableCheckIn({ ...fresh, lat: Number.NaN })).toBe(false);
    const drawn = drawableCheckIns([fresh, expired, elsewhere]);
    expect(drawn.map((c) => c.placeId)).toEqual(['ChIJbayStreetBowls', 'ChIJother']);
    // The narrowed type has numbers, ready for a marker.
    const first = drawn[0];
    expect(first ? first.lat + first.lng : null).toBeCloseTo(34.0071 - 118.4702);
  });

  it('still counts a check-in without a position toward its region’s heat', () => {
    const times = regionCheckInTimes([fresh, expired, elsewhere], 'r1');
    expect(times).toEqual([...fresh.times, ...expired.times]);
    // 1 for today, 0.5 for 21 days ago, 0.25 for 42 days ago.
    expect(regionHeat(times, NOW)).toBeCloseTo(1.75);
    expect(regionHeat(regionCheckInTimes([fresh], 'r1'), NOW)).toBeCloseTo(1);
  });

  it('ignores check-ins outside any region', () => {
    const loose: MapCheckIn = { regionId: null, lat: 1, lng: 1, times: ['2026-11-14T12:00:00Z'] };
    expect(regionCheckInTimes([loose], 'r1')).toEqual([]);
  });
});
