/**
 * The caller's check-ins on the map, one entry per place. A place's name and position can be gone
 * (Google content is kept for at most 30 days) while the visits still count: such a check-in is
 * never drawn, but it still warms its region.
 */

export interface MapCheckIn {
  readonly regionId: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  /** ISO times, most recent first. */
  readonly times: readonly string[];
}

/** A check-in whose place still has a position, so it can be drawn. */
export type DrawableCheckIn<C extends MapCheckIn> = C & {
  readonly lat: number;
  readonly lng: number;
};

export function isDrawableCheckIn<C extends MapCheckIn>(checkIn: C): checkIn is DrawableCheckIn<C> {
  return (
    checkIn.lat !== null &&
    checkIn.lng !== null &&
    Number.isFinite(checkIn.lat) &&
    Number.isFinite(checkIn.lng)
  );
}

/** The check-ins to put on the map: those whose place still has a position. */
export function drawableCheckIns<C extends MapCheckIn>(
  checkIns: readonly C[],
): DrawableCheckIn<C>[] {
  return checkIns.filter(isDrawableCheckIn);
}

/** Every check-in time in a region, drawable or not, for `regionHeat` and `daysUntilCooler`. */
export function regionCheckInTimes(checkIns: readonly MapCheckIn[], regionId: string): string[] {
  const times: string[] = [];
  for (const checkIn of checkIns) {
    if (checkIn.regionId === regionId) times.push(...checkIn.times);
  }
  return times;
}
