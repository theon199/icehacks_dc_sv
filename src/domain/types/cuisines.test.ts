import {
  CUISINES,
  cuisineIdSchema,
  cuisineInfo,
  cuisineLabel,
  cuisineRegion,
  cuisinesInRegion,
  REGIONS,
} from './cuisines';

describe('cuisines', () => {
  it('lists every cuisine once with a known region', () => {
    const ids = CUISINES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const info of CUISINES) {
      expect(REGIONS).toContain(info.region);
      expect(cuisineIdSchema.safeParse(info.id).success).toBe(true);
    }
  });

  it('looks up labels and regions', () => {
    expect(cuisineInfo('thai')).toEqual({ id: 'thai', label: 'Thai', region: 'southeast_asia' });
    expect(cuisineRegion('indian')).toBe('south_asia');
    expect(cuisineRegion('atlantean')).toBeUndefined();
  });

  it('falls back to a readable label for ids this build does not list', () => {
    expect(cuisineLabel('cape_verdean')).toBe('Cape Verdean');
    expect(cuisineLabel('mexican')).toBe('Mexican');
  });

  it('groups cuisines by region', () => {
    expect(cuisinesInRegion('east_asia').map((c) => c.id)).toEqual(
      expect.arrayContaining(['chinese', 'japanese', 'korean']),
    );
  });

  it('validates cuisine id shape', () => {
    expect(cuisineIdSchema.safeParse('Sri Lankan').success).toBe(false);
    expect(cuisineIdSchema.safeParse('').success).toBe(false);
  });
});
