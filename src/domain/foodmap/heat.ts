/**
 * Region heat: how recently and how often someone ate in a region.
 *
 * Each check-in adds 0.5^(ageDays / HEAT_HALF_LIFE_DAYS), so a check-in today adds 1 and one from
 * three weeks ago adds 0.5. Check-in times are ISO strings from the server; ones that do not parse
 * are ignored, and ones later than `now` (clock skew) count as happening now.
 *
 * Shades for the map, from the lower bounds in `HEAT_SHADE_THRESHOLDS`:
 * - 0: heat below 0.25 (nothing, or a single visit more than six weeks ago)
 * - 1: from 0.25 (one recent visit)
 * - 2: from 1.5 (two recent visits)
 * - 3: from 3
 * - 4: from 6
 */
import { HEAT_HALF_LIFE_DAYS } from './constants';

export type HeatShade = 0 | 1 | 2 | 3 | 4;

/** Lower bound of shades 1, 2, 3 and 4. */
export const HEAT_SHADE_THRESHOLDS: readonly [number, number, number, number] = [0.25, 1.5, 3, 6];

const DAY_MS = 86_400_000;

function checkInMs(times: readonly string[]): number[] {
  const result: number[] = [];
  for (const time of times) {
    const ms = Date.parse(time);
    if (Number.isFinite(ms)) result.push(ms);
  }
  return result;
}

function heatAt(checkIns: readonly number[], nowMs: number): number {
  let heat = 0;
  for (const ms of checkIns) {
    const ageDays = Math.max(0, nowMs - ms) / DAY_MS;
    heat += 0.5 ** (ageDays / HEAT_HALF_LIFE_DAYS);
  }
  return heat;
}

export function regionHeat(times: readonly string[], now: Date): number {
  return heatAt(checkInMs(times), now.getTime());
}

export function heatShade(heat: number): HeatShade {
  if (!(heat >= HEAT_SHADE_THRESHOLDS[0])) return 0; // also catches NaN
  if (heat < HEAT_SHADE_THRESHOLDS[1]) return 1;
  if (heat < HEAT_SHADE_THRESHOLDS[2]) return 2;
  if (heat < HEAT_SHADE_THRESHOLDS[3]) return 3;
  return 4;
}

/**
 * Whole days from `now` until the region's shade drops one step if no one checks in again ("cools
 * in N days"): the smallest whole number of days at which the shade is lower. A drop due in a few
 * hours counts as 1 day. `null` when the shade is already 0, or when the heat is not a finite
 * number so no drop can be predicted.
 */
export function daysUntilCooler(times: readonly string[], now: Date): number | null {
  const nowMs = now.getTime();
  // A time later than `now` already counts as now; pinning it there keeps the decay a single curve.
  const checkIns = checkInMs(times).map((ms) => Math.min(ms, nowMs));
  const heat = heatAt(checkIns, nowMs);
  const shade = heatShade(heat);
  if (shade === 0 || !Number.isFinite(heat)) return null;
  const shadeAt = (days: number) => heatShade(heatAt(checkIns, nowMs + days * DAY_MS));

  // From now on the heat is heat * 0.5^(days / half-life); the steps only correct rounding.
  const bound = HEAT_SHADE_THRESHOLDS[shade - 1] ?? 0;
  let days = Math.max(1, Math.floor(HEAT_HALF_LIFE_DAYS * Math.log2(heat / bound)) + 1);
  while (days > 1 && shadeAt(days - 1) < shade) days--;
  while (shadeAt(days) >= shade) days++;
  return days;
}
