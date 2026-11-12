/** Helpers for reading expo-router search params, which may arrive as a string or string[]. */
export type RawParam = string | string[] | undefined;

/** First value of a route param, trimmed; undefined when absent or empty. */
export function stringParam(value: RawParam): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : undefined;
}

/** All values of a repeated param (e.g. `?tag=a&tag=b`), without empties. */
export function listParam(value: RawParam): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map((v) => v.trim()).filter((v) => v.length > 0);
}

/** Integer param within bounds, or undefined. */
export function intParam(
  value: RawParam,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
) {
  const raw = stringParam(value);
  if (raw === undefined || !/^-?\d+$/.test(raw)) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return parsed >= min && parsed <= max ? parsed : undefined;
}
