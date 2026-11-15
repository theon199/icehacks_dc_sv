/**
 * Food map rules shared with the server. The edge functions keep their own copy in
 * `supabase/functions`; the values must stay identical so the app's previews (a greyed-out check-in
 * button, a progress ring) agree with what the server decides.
 */

/** A check-in counts within this many metres of the place. */
export const CHECK_IN_RADIUS_M = 200;

/** GPS accuracy widens the radius by up to this many metres. */
export const CHECK_IN_MAX_ACCURACY_BONUS_M = 100;

/** The server refuses a check-in whose reported accuracy is above this (a bad request). */
export const CHECK_IN_MAX_REPORTED_ACCURACY_M = 1000;

/** One check-in per place per person in this many hours. */
export const CHECK_IN_COOLDOWN_HOURS = 4;

/** Check-ins per person in any rolling 24 hours. */
export const CHECK_IN_DAILY_LIMIT = 12;

/** Target spots per region. */
export const SPOTS_PER_REGION_MAX = 5;

/** Photos per spot. */
export const PHOTOS_PER_SPOT_MAX = 3;

/** Region heat halves every this many days. */
export const HEAT_HALF_LIFE_DAYS = 21;

/** Total check-ins at which each glow level starts; level 1 starts at 0. */
export const GLOW_LEVELS: readonly number[] = [0, 5, 12, 20, 30, 42, 56, 72];
