import {
  GOAL_DETAILS,
  GOAL_IDS,
  GOAL_TAGS,
  goalIdSchema,
  goalsTagMask,
  goalTagListJsonSchema,
  goalTagMask,
} from './goals';

describe('goals', () => {
  it('lists every goal once, in schema order', () => {
    expect(new Set(GOAL_IDS).size).toBe(GOAL_IDS.length);
    expect(Object.keys(GOAL_DETAILS).sort()).toEqual([...GOAL_IDS].sort());
    expect(goalIdSchema.safeParse('more_protein').success).toBe(true);
    expect(goalIdSchema.safeParse('bulk_up').success).toBe(false);
  });

  it('maps every goal to at least one recipe tag and a matching mask', () => {
    for (const goal of GOAL_IDS) {
      const { servedBy, mask, label } = GOAL_DETAILS[goal];
      expect(servedBy.length).toBeGreaterThan(0);
      expect(mask).toBe(goalTagMask(servedBy));
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('builds one bit per tag', () => {
    expect(goalTagMask(['high_protein'])).toBe(1);
    expect(goalTagMask(['high_protein', 'heart_friendly'])).toBe(1 | (1 << 6));
    expect(goalTagMask([...GOAL_TAGS])).toBe((1 << GOAL_TAGS.length) - 1);
  });

  it('combines the tags behind several goals', () => {
    expect(goalsTagMask(['heart_friendly'])).toBe(goalTagMask(['heart_friendly', 'lower_sat_fat']));
    expect(goalsTagMask([])).toBe(0);
  });

  it('parses catalog tag lists, dropping unknown tags and duplicates', () => {
    expect(goalTagListJsonSchema.parse('["high_fiber","keto","high_fiber"]')).toEqual([
      'high_fiber',
    ]);
    expect(goalTagListJsonSchema.safeParse('"high_fiber"').success).toBe(false);
  });
});
