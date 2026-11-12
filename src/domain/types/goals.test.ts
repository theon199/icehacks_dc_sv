import {
  GOAL_TAGS,
  GOAL_TAGS_FOR,
  GOALS,
  goalsTagMask,
  goalTagListJsonSchema,
  goalTagMask,
} from './goals';

describe('goals', () => {
  it('maps every goal to at least one recipe tag', () => {
    for (const goal of GOALS) expect(GOAL_TAGS_FOR[goal].length).toBeGreaterThan(0);
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
