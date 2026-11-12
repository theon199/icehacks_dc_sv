/**
 * When to offer push notifications. Famara asks with its own card first and only then shows the
 * system prompt, so a "not now" never burns the one-time iOS dialog.
 *
 * The card appears at a moment where push clearly helps: the inbox already has something in it, or
 * the person just shared or commented and will want to hear back. It never nags: at most three
 * offers, at least two weeks apart, and never again after "Don't ask again".
 */

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export type PushMoment = 'inbox_has_activity' | 'after_sharing';

export interface PromptHistory {
  /** Times the card was dismissed with "Not now". */
  dismissals: number;
  /** Epoch ms of the last dismissal. */
  lastDismissedAt: number | null;
  /** The person chose "Don't ask again". */
  optedOut: boolean;
}

export const EMPTY_PROMPT_HISTORY: PromptHistory = {
  dismissals: 0,
  lastDismissedAt: null,
  optedOut: false,
};

export const MAX_DISMISSALS = 3;
export const COOL_DOWN_MS = 14 * 86_400_000;

export interface OfferInput {
  permission: PushPermission;
  /** False once iOS will no longer show its dialog; only Settings can turn push on then. */
  canAskAgain: boolean;
  /** Famara's own push switch. */
  pushEnabled: boolean;
  history: PromptHistory;
  moment: PushMoment;
  now: number;
}

export function shouldOfferPush(input: OfferInput): boolean {
  const { permission, canAskAgain, pushEnabled, history, now } = input;
  if (permission === 'granted' && pushEnabled) return false;
  if (permission === 'denied' && !canAskAgain) return false;
  if (history.optedOut || history.dismissals >= MAX_DISMISSALS) return false;
  if (history.lastDismissedAt != null && now - history.lastDismissedAt < COOL_DOWN_MS) return false;
  return true;
}

export function recordDismissal(
  history: PromptHistory,
  now: number,
  forever = false,
): PromptHistory {
  return {
    dismissals: history.dismissals + 1,
    lastDismissedAt: now,
    optedOut: history.optedOut || forever,
  };
}

/** Registrations are refreshed weekly so the server's last-seen time stays meaningful. */
export const REGISTRATION_TTL_MS = 7 * 86_400_000;

export interface RegistrationRecord {
  token: string;
  userId: string;
  at: number;
}

export function needsRegistration(
  previous: RegistrationRecord | null,
  next: { token: string; userId: string },
  now: number,
): boolean {
  if (!previous) return true;
  if (previous.token !== next.token || previous.userId !== next.userId) return true;
  return now - previous.at >= REGISTRATION_TTL_MS;
}
