import { myStatsSchema } from './schemas';

const valid = {
  cooked_count: 8,
  cooked_this_week: 2,
  current_streak: 3,
  longest_streak: 5,
  last_cooked_at: '2026-11-10T19:00:00Z',
  cuisine_count: 2,
  cuisines: [{ cuisine: 'thai', count: 5 }],
  post_count: 1,
  likes_received: 4,
  badges: [],
};

describe('myStatsSchema', () => {
  it('accepts what my_stats returns', () => {
    expect(myStatsSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['a missing count', { ...valid, cooked_count: undefined }],
    ['a count that is not a number', { ...valid, current_streak: 'three' }],
    ['a negative count', { ...valid, likes_received: -1 }],
    ['a malformed last cook', { ...valid, last_cooked_at: 42 }],
  ])('rejects %s rather than reading it as zero', (_label, reply) => {
    expect(myStatsSchema.safeParse(reply).success).toBe(false);
  });
});
