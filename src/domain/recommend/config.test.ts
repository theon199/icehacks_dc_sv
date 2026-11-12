import {
  DEFAULT_RANKING_CONFIG,
  F,
  FEATURE_COUNT,
  FEATURES,
  RANKING_CONFIG_V1,
  weightSum,
  weightVector,
} from './config';

describe('ranking config', () => {
  it('has feature weights that sum to 1', () => {
    expect(weightSum(RANKING_CONFIG_V1)).toBeCloseTo(1, 10);
  });

  it('has no negative weights', () => {
    for (const name of FEATURES) expect(RANKING_CONFIG_V1.weights[name]).toBeGreaterThanOrEqual(0);
  });

  it('is the default and carries a version', () => {
    expect(DEFAULT_RANKING_CONFIG).toBe(RANKING_CONFIG_V1);
    expect(RANKING_CONFIG_V1.version).toBe(1);
  });

  it('packs weights in feature order', () => {
    const packed = weightVector(RANKING_CONFIG_V1);
    expect(packed).toHaveLength(FEATURE_COUNT);
    FEATURES.forEach((name, i) => {
      expect(F[name]).toBe(i);
      expect(packed[i]).toBe(RANKING_CONFIG_V1.weights[name]);
    });
  });

  it('keeps feature scales and thresholds inside [0, 1]', () => {
    const c = RANKING_CONFIG_V1;
    const unitValues = [
      ...Object.values(c.cuisine),
      ...Object.values(c.dataQuality),
      c.goal.coverageShare,
      c.time.unknown,
      c.time.maxShrink,
      c.effort.onePastLimit,
      c.effort.twoPastLimit,
      c.feed.pantryMinCoverage,
      c.diversity.maxIngredientOverlap,
    ];
    for (const value of unitValues) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(c.cuisine.loved).toBeGreaterThan(c.cuisine.sameRegion);
    expect(c.cuisine.sameRegion).toBeGreaterThan(c.cuisine.other);
    expect(c.taste.mix.cuisine + c.taste.mix.ingredients + c.taste.mix.goalTags).toBeCloseTo(1);
  });
});
