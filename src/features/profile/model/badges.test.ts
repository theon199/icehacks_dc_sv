import type { MyStats } from '@/lib/supabase/database.types';

import { buildBadgeGrid, earnedCount, metricValue, type BadgeDefinition } from './badges';

const definitions: BadgeDefinition[] = [
  { id: 'cooks_10', name: 'Ten dishes', description: 'Cook 10 dishes.', metric: 'cook_count', threshold: 10, sort_order: 2 },
  { id: 'first_cook', name: 'First dish', description: 'Cook your first dish.', metric: 'cook_count', threshold: 1, sort_order: 1 },
  { id: 'streak_3', name: 'Three in a row', description: 'Cook three days running.', metric: 'streak_days', threshold: 3, sort_order: 3 },
  { id: 'mystery', name: 'Mystery', description: 'Something new.', metric: 'unknown_metric', threshold: 5, sort_order: 4 },
];

const stats: MyStats = {
  cooked_count: 4,
  cooked_this_week: 1,
  current_streak: 3,
  longest_streak: 3,
  last_cooked_at: null,
  cuisine_count: 2,
  cuisines: [],
  post_count: 1,
  likes_received: 0,
  badges: [{ badge_id: 'first_cook', awarded_at: '2026-11-01T10:00:00Z' }],
};

describe('buildBadgeGrid', () => {
  const grid = buildBadgeGrid(definitions, stats, stats.badges);
  const badge = (id: string) => grid.find((b) => b.id === id);

  it('keeps catalog order', () => {
    expect(grid.map((b) => b.id)).toEqual(['first_cook', 'cooks_10', 'streak_3', 'mystery']);
  });

  it('marks earned badges with their award time', () => {
    expect(badge('first_cook')).toMatchObject({
      earned: true,
      awardedAt: '2026-11-01T10:00:00Z',
      progress: 1,
      progressLabel: null,
    });
    expect(badge('first_cook')?.accessibilityLabel).toMatch(/^First dish, earned\./);
  });

  it('shows progress towards unearned badges', () => {
    expect(badge('cooks_10')).toMatchObject({ earned: false, progress: 0.4, progressLabel: '4 of 10' });
    expect(badge('cooks_10')?.accessibilityLabel).toMatch(/not earned yet, 4 of 10/);
  });

  it('never shows a full bar for a badge the server has not awarded', () => {
    expect(badge('streak_3')).toMatchObject({ earned: false, progressLabel: 'Nearly there' });
    expect(badge('streak_3')?.progress).toBeLessThan(1);
  });

  it('shows no progress for metrics it does not know', () => {
    expect(badge('mystery')).toMatchObject({ progress: 0, progressLabel: null });
  });

  it('works before stats load', () => {
    const empty = buildBadgeGrid(definitions, null, []);
    expect(empty.every((b) => !b.earned && b.progressLabel === null)).toBe(true);
  });

  it('counts earned badges', () => {
    expect(earnedCount(grid)).toBe(1);
  });
});

describe('metricValue', () => {
  it('reads each metric from the stats', () => {
    expect(metricValue('cuisine_count', stats)).toBe(2);
    expect(metricValue('post_count', stats)).toBe(1);
    expect(metricValue('cook_count', null)).toBeNull();
  });
});
