/**
 * Builds the badge grid: every badge in the catalog, whether it is earned, and how close the
 * person is to the ones they have not earned yet.
 */
import type { EarnedBadge, MyStats } from '@/lib/supabase/database.types';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  metric: string;
  threshold: number;
  sort_order: number;
}

export interface BadgeView {
  id: string;
  name: string;
  description: string;
  earned: boolean;
  awardedAt: string | null;
  /** 0..1; 1 only when earned. */
  progress: number;
  /** e.g. "4 of 10", or null when there is nothing to measure. */
  progressLabel: string | null;
  accessibilityLabel: string;
}

/** The stat each badge metric is measured against. */
export function metricValue(metric: string, stats: MyStats | null): number | null {
  if (!stats) return null;
  switch (metric) {
    case 'cook_count':
      return stats.cooked_count;
    case 'streak_days':
      return stats.current_streak;
    case 'cuisine_count':
      return stats.cuisine_count;
    case 'post_count':
      return stats.post_count;
    default:
      return null;
  }
}

function progressFor(
  definition: BadgeDefinition,
  stats: MyStats | null,
): Pick<BadgeView, 'progress' | 'progressLabel'> {
  const value = metricValue(definition.metric, stats);
  const threshold = definition.threshold;
  if (value == null || !Number.isFinite(value) || threshold <= 0) {
    return { progress: 0, progressLabel: null };
  }
  const current = Math.max(0, Math.floor(value));
  if (current >= threshold) {
    // The stats already reach the bar but the server has not awarded it: only cooks logged close to
    // when they happened count, so say how close it is without promising it.
    return { progress: (threshold - 1) / threshold, progressLabel: 'Nearly there' };
  }
  return { progress: current / threshold, progressLabel: `${current} of ${threshold}` };
}

export function buildBadgeGrid(
  definitions: readonly BadgeDefinition[],
  stats: MyStats | null,
  earned: readonly EarnedBadge[],
): BadgeView[] {
  const awardedAt = new Map(earned.map((badge) => [badge.badge_id, badge.awarded_at]));
  return [...definitions]
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((definition) => {
      const awarded = awardedAt.get(definition.id) ?? null;
      const isEarned = awarded != null;
      const { progress, progressLabel } = isEarned
        ? { progress: 1, progressLabel: null }
        : progressFor(definition, stats);
      const state = isEarned ? 'earned' : progressLabel ? `not earned yet, ${progressLabel}` : 'not earned yet';
      return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        earned: isEarned,
        awardedAt: awarded,
        progress,
        progressLabel,
        accessibilityLabel: `${definition.name}, ${state}. ${definition.description}`,
      };
    });
}

export function earnedCount(grid: readonly BadgeView[]): number {
  return grid.filter((badge) => badge.earned).length;
}
