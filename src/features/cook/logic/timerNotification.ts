/**
 * The payload of the local notification a cook timer posts when it finishes in the background.
 * It is not an inbox notification: a tap should return to the cook session at `url`, so whatever
 * handles notification taps can recognise it with `cookTimerTapUrl`.
 */

export const COOK_TIMER_NOTIFICATION_KIND = 'cook_timer';

export interface CookTimerNotificationData {
  kind: typeof COOK_TIMER_NOTIFICATION_KIND;
  /** In-app route of the cook session, e.g. `/cook/mealdb%3A1`. */
  url: string;
}

/**
 * The cook route a tapped notification should open, or null when the data is not a cook timer's.
 * Only in-app cook routes are returned, so a crafted payload cannot send the app elsewhere.
 */
export function cookTimerTapUrl(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { kind, url } = data as Partial<Record<keyof CookTimerNotificationData, unknown>>;
  if (kind !== COOK_TIMER_NOTIFICATION_KIND || typeof url !== 'string') return null;
  return /^\/cook\/[^/?#]+$/.test(url) ? url : null;
}
