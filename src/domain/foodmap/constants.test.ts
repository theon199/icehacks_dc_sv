import {
  CHECK_IN_COOLDOWN_HOURS,
  CHECK_IN_DAILY_LIMIT,
  CHECK_IN_MAX_ACCURACY_BONUS_M,
  CHECK_IN_MAX_REPORTED_ACCURACY_M,
  CHECK_IN_RADIUS_M,
  GLOW_LEVELS,
  HEAT_HALF_LIFE_DAYS,
  PHOTOS_PER_SPOT_MAX,
  SPOTS_PER_REGION_MAX,
} from './constants';

describe('food map constants', () => {
  // These mirror the server's copy in supabase/functions; change both together.
  it('match the shared contract', () => {
    expect({
      CHECK_IN_RADIUS_M,
      CHECK_IN_MAX_ACCURACY_BONUS_M,
      CHECK_IN_MAX_REPORTED_ACCURACY_M,
      CHECK_IN_COOLDOWN_HOURS,
      CHECK_IN_DAILY_LIMIT,
      SPOTS_PER_REGION_MAX,
      PHOTOS_PER_SPOT_MAX,
      HEAT_HALF_LIFE_DAYS,
      GLOW_LEVELS,
    }).toEqual({
      CHECK_IN_RADIUS_M: 200,
      CHECK_IN_MAX_ACCURACY_BONUS_M: 100,
      CHECK_IN_MAX_REPORTED_ACCURACY_M: 1000,
      CHECK_IN_COOLDOWN_HOURS: 4,
      CHECK_IN_DAILY_LIMIT: 12,
      SPOTS_PER_REGION_MAX: 5,
      PHOTOS_PER_SPOT_MAX: 3,
      HEAT_HALF_LIFE_DAYS: 21,
      GLOW_LEVELS: [0, 5, 12, 20, 30, 42, 56, 72],
    });
  });

  it('keeps glow thresholds strictly increasing from 0', () => {
    expect(GLOW_LEVELS[0]).toBe(0);
    for (let i = 1; i < GLOW_LEVELS.length; i++) {
      expect(GLOW_LEVELS[i]).toBeGreaterThan(GLOW_LEVELS[i - 1] ?? Infinity);
    }
  });
});
