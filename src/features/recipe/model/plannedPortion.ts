/**
 * The portion a meal was planned at, when its recipe is opened from the plan. The recipe screen
 * sizes servings as either half or standard portions, so only those two values are accepted from
 * the route; anything else falls back to the small-appetite setting.
 */
import { stringParam, type RawParam } from '@/lib/params';

export type PlannedPortion = 0.5 | 1;

/** A `portion` route param as a planned portion, or undefined when absent or not 0.5 or 1. */
export function plannedPortionParam(value: RawParam): PlannedPortion | undefined {
  const raw = stringParam(value);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return parsed === 0.5 || parsed === 1 ? parsed : undefined;
}

/** Whether each serving is a half portion: the plan decides when it says, otherwise the setting. */
export function servesHalfPortions(
  planned: PlannedPortion | undefined,
  smallAppetite: boolean,
): boolean {
  return planned === undefined ? smallAppetite : planned === 0.5;
}

/**
 * A short line saying the plan chose the size, or null when there is nothing to point out: no
 * planned portion, or a standard one while small appetite mode is off anyway.
 */
export function plannedPortionNote(
  planned: PlannedPortion | undefined,
  smallAppetite: boolean,
): string | null {
  if (planned === 0.5) return 'Half portion, as planned';
  if (planned === 1 && smallAppetite) return 'Full portion, as planned';
  return null;
}
