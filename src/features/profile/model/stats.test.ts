import type { MyStats } from '@/lib/supabase/database.types';

import { isFreshStart, localDateString, statTiles, topCuisines } from './stats';

const stats: MyStats = {
  cooked_count: 1234,
  cooked_this_week: 3,
  current_streak: 1,
  longest_streak: 9,
  last_cooked_at: '2026-11-10T18:00:00Z',
  cuisine_count: 1,
  cuisines: [
    { cuisine: 'indian', count: 4 },
    { cuisine: 'west_african', count: 9 },
    { cuisine: 'thai', count: 4 },
    { cuisine: 'mexican', count: 0 },
  ],
  post_count: 0,
  likes_received: 2,
  badges: [],
};

describe('localDateString', () => {
  it('uses the local calendar day', () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('statTiles', () => {
  const tiles = statTiles(stats, 'en-US');
  const tile = (key: string) => tiles.find((t) => t.key === key);

  it('shows the five stats in order', () => {
    expect(tiles.map((t) => t.key)).toEqual(['cooked', 'streak', 'cuisines', 'posts', 'likes']);
  });

  it('formats numbers for the locale and adds the weekly count', () => {
    expect(tile('cooked')).toMatchObject({ value: '1,234', caption: '3 this week' });
    expect(tile('cooked')?.accessibilityLabel).toBe('1,234 dishes cooked, 3 this week');
  });

  it('shows the best streak and reads singular days correctly', () => {
    expect(tile('streak')).toMatchObject({ value: '1', caption: 'Best 9' });
    expect(tile('streak')?.accessibilityLabel).toBe('1 day in a row, best 9');
  });

  it('uses singular labels for one', () => {
    expect(tile('cuisines')?.label).toBe('Cuisine');
    expect(tile('posts')?.label).toBe('Posts');
    expect(tile('likes')?.accessibilityLabel).toBe('2 likes received');
  });

  it('never shows negative or broken numbers', () => {
    const broken = statTiles(
      { ...stats, cooked_count: Number.NaN, current_streak: -2, longest_streak: 0 },
      'en-US',
    );
    expect(broken[0]?.value).toBe('0');
    expect(broken[1]).toMatchObject({ value: '0', caption: null });
  });

  it('omits the weekly caption when nothing was cooked this week', () => {
    expect(statTiles({ ...stats, cooked_this_week: 0 }, 'en-US')[0]?.caption).toBeNull();
  });
});

describe('topCuisines', () => {
  it('orders by count then name and drops empty entries', () => {
    expect(topCuisines(stats).map((c) => c.label)).toEqual(['West African', 'Indian', 'Thai']);
  });

  it('respects the limit', () => {
    expect(topCuisines(stats, 1)).toEqual([
      { id: 'west_african', label: 'West African', count: 9 },
    ]);
  });
});

describe('isFreshStart', () => {
  it('is true only before anything was cooked or shared', () => {
    expect(isFreshStart(stats)).toBe(false);
    expect(isFreshStart({ ...stats, cooked_count: 0, post_count: 0 })).toBe(true);
  });
});
