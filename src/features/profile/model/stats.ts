/**
 * Turns the `my_stats` result into the tiles and chips the profile shows.
 */
import type { MyStats } from '@/lib/supabase/database.types';
import { formatNumber } from '@/lib/format';

import { cuisineLabel } from './cuisines';

/** The device's calendar day as `YYYY-MM-DD`, which `my_stats` uses to count streaks. */
export function localDateString(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type StatKey = 'cooked' | 'streak' | 'cuisines' | 'posts' | 'likes';

export interface StatTile {
  key: StatKey;
  value: string;
  label: string;
  /** Secondary line, e.g. "3 this week". */
  caption: string | null;
  /** Whole tile read as one sentence by VoiceOver. */
  accessibilityLabel: string;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function statTiles(stats: MyStats, locale?: string): StatTile[] {
  const n = (value: number) => formatNumber(value, 0, locale);
  const cooked = safeCount(stats.cooked_count);
  const week = safeCount(stats.cooked_this_week);
  const streak = safeCount(stats.current_streak);
  const best = Math.max(streak, safeCount(stats.longest_streak));
  const cuisines = safeCount(stats.cuisine_count);
  const posts = safeCount(stats.post_count);
  const likes = safeCount(stats.likes_received);

  return [
    {
      key: 'cooked',
      value: n(cooked),
      label: 'Cooked',
      caption: week > 0 ? `${n(week)} this week` : null,
      accessibilityLabel:
        `${n(cooked)} ${plural(cooked, 'dish', 'dishes')} cooked` +
        (week > 0 ? `, ${n(week)} this week` : ''),
    },
    {
      key: 'streak',
      value: n(streak),
      label: 'Day streak',
      caption: best > 0 ? `Best ${n(best)}` : null,
      accessibilityLabel:
        `${n(streak)} ${plural(streak, 'day', 'days')} in a row` +
        (best > 0 ? `, best ${n(best)}` : ''),
    },
    {
      key: 'cuisines',
      value: n(cuisines),
      label: plural(cuisines, 'Cuisine', 'Cuisines'),
      caption: null,
      accessibilityLabel: `${n(cuisines)} ${plural(cuisines, 'cuisine', 'cuisines')} explored`,
    },
    {
      key: 'posts',
      value: n(posts),
      label: plural(posts, 'Post', 'Posts'),
      caption: null,
      accessibilityLabel: `${n(posts)} ${plural(posts, 'post', 'posts')} shared`,
    },
    {
      key: 'likes',
      value: n(likes),
      label: plural(likes, 'Like', 'Likes'),
      caption: null,
      accessibilityLabel: `${n(likes)} ${plural(likes, 'like', 'likes')} received`,
    },
  ];
}

export interface CuisineTally {
  id: string;
  label: string;
  count: number;
}

/** Most-cooked cuisines first (ties alphabetical), for the chips under the stats. */
export function topCuisines(stats: MyStats, limit = 6): CuisineTally[] {
  return stats.cuisines
    .filter((entry) => entry.cuisine && entry.count > 0)
    .map((entry) => ({ id: entry.cuisine, label: cuisineLabel(entry.cuisine), count: entry.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Nudge shown when nothing has been logged yet. */
export function isFreshStart(stats: MyStats): boolean {
  return safeCount(stats.cooked_count) === 0 && safeCount(stats.post_count) === 0;
}
