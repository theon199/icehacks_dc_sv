/**
 * Glow level: how far someone has come, from their total check-ins across all their data.
 *
 * Levels are 1-based. Level n starts at `GLOW_LEVELS[n - 1]` check-ins, so everyone starts at
 * level 1 and level 8 (the last) starts at 72. Past the last threshold the level stays at the
 * maximum: `nextAt` is `null`, `remaining` is 0 and `progress` is 1.
 */
import { GLOW_LEVELS } from './constants';

export interface GlowLevel {
  /** 1 … `GLOW_LEVELS.length`. */
  readonly level: number;
  /** Total check-ins at which the next level starts; `null` at the top level. */
  readonly nextAt: number | null;
  /** Check-ins still needed for the next level; 0 at the top level. */
  readonly remaining: number;
  /** 0 … 1 through the current level; 1 at the top level. */
  readonly progress: number;
}

export const MAX_GLOW_LEVEL = GLOW_LEVELS.length;

/** Negative, fractional or non-finite totals are read as the whole number of check-ins, at least 0. */
function wholeCount(total: number): number {
  return Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
}

export function glowLevel(totalCheckIns: number): GlowLevel {
  const total = wholeCount(totalCheckIns);
  let index = 0;
  for (let i = 0; i < GLOW_LEVELS.length; i++) {
    if (total >= (GLOW_LEVELS[i] ?? Infinity)) index = i;
  }
  const start = GLOW_LEVELS[index] ?? 0;
  const next = GLOW_LEVELS[index + 1];
  if (next === undefined) {
    return { level: index + 1, nextAt: null, remaining: 0, progress: 1 };
  }
  return {
    level: index + 1,
    nextAt: next,
    remaining: next - total,
    progress: (total - start) / (next - start),
  };
}
