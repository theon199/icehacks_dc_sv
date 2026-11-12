/**
 * What finishing a dish does. Local effects come first and never wait for the network: the cook is
 * written to the cook log and a `cooked` signal (worth +2 in ranking) goes to recommendation
 * feedback. Then the cook is reported to the server for stats, streaks and badges; if that cannot
 * happen now it is queued and retried later with the same idempotency key.
 */
import type { NewCookEntry, NewFeedbackEvent } from '@/stores';

export interface CookCompletion {
  recipeId: string;
  /** Catalog cuisine id of the recipe, when known (feeds the cuisine badges). */
  cuisine: string | null;
  rating: number | null;
  wouldCookAgain: boolean | null;
  notes: string;
  servings: number | null;
  cookedAt: Date;
  /** Stable per completion screen, so saving twice never logs twice anywhere. */
  clientEventId: string;
}

/** The server call, in the shape `record_cook_event` takes. */
export interface CookEventRequest {
  recipeRef: string;
  localDate: string;
  cookedAt: string;
  cuisine: string | null;
  rating: number | null;
  clientEventId: string;
}

export interface CookEventResponse {
  eventId: string;
  newBadges: string[];
}

/** Why the server call failed: worth retrying later, or never going to succeed. */
export type CookEventFailure = 'retry' | 'drop';

export interface CompletionDeps {
  logCook(entry: NewCookEntry, at: string): string | null;
  recordFeedback(event: NewFeedbackEvent, at: string): void;
  recordCookEvent(request: CookEventRequest): Promise<CookEventResponse>;
  classifyFailure(error: unknown): CookEventFailure;
  /** Queues the request for a later retry; false when it cannot be queued (signed out). */
  enqueue(request: CookEventRequest): boolean;
  localDate(date: Date): string;
}

export type CompletionOutcome =
  | { status: 'synced'; entryId: string | null; newBadges: string[] }
  /** Saved on this device; the server will hear about it on a later retry. */
  | { status: 'queued'; entryId: string | null }
  /** Saved on this device; the server refused it (e.g. the daily limit), so stats skip it. */
  | { status: 'local_only'; entryId: string | null };

const CUISINE_ID = /^[a-z][a-z_]{0,39}$/;
export const MAX_NOTES_LENGTH = 1000;

export function buildCookEventRequest(
  completion: CookCompletion,
  localDate: (date: Date) => string,
): CookEventRequest {
  const cuisine =
    completion.cuisine && CUISINE_ID.test(completion.cuisine) ? completion.cuisine : null;
  return {
    recipeRef: completion.recipeId,
    localDate: localDate(completion.cookedAt),
    cookedAt: completion.cookedAt.toISOString(),
    cuisine,
    rating: validRating(completion.rating),
    clientEventId: completion.clientEventId,
  };
}

function validRating(rating: number | null): number | null {
  return rating !== null && Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

/** Applies the local effects of finishing a dish. Separate so a retry never repeats them. */
export function recordLocally(completion: CookCompletion, deps: CompletionDeps): string | null {
  const at = completion.cookedAt.toISOString();
  const notes = completion.notes.trim().slice(0, MAX_NOTES_LENGTH);
  const entryId = deps.logCook(
    {
      recipeId: completion.recipeId,
      rating: validRating(completion.rating),
      wouldCookAgain: completion.wouldCookAgain,
      notes: notes.length > 0 ? notes : null,
      servings: completion.servings,
    },
    at,
  );
  deps.recordFeedback({ recipeId: completion.recipeId, kind: 'cooked' }, at);
  return entryId;
}

/** Reports a cook to the server, queueing it when the failure is temporary. */
export async function reportCook(
  request: CookEventRequest,
  deps: Pick<CompletionDeps, 'recordCookEvent' | 'classifyFailure' | 'enqueue'>,
): Promise<{ status: 'synced'; newBadges: string[] } | { status: 'queued' | 'local_only' }> {
  try {
    const response = await deps.recordCookEvent(request);
    return { status: 'synced', newBadges: response.newBadges };
  } catch (error) {
    if (deps.classifyFailure(error) === 'retry' && deps.enqueue(request)) {
      return { status: 'queued' };
    }
    return { status: 'local_only' };
  }
}

export async function completeCook(
  completion: CookCompletion,
  deps: CompletionDeps,
): Promise<CompletionOutcome> {
  const entryId = recordLocally(completion, deps);
  const result = await reportCook(buildCookEventRequest(completion, deps.localDate), deps);
  return result.status === 'synced'
    ? { status: 'synced', entryId, newBadges: result.newBadges }
    : { status: result.status, entryId };
}

/**
 * Toast copy for badges just earned, or null when there are none. Badge names live on the server
 * (and on the profile screen that lists them), so the toast counts them rather than naming them.
 */
export function badgeMessage(badges: readonly string[]): string | null {
  const count = new Set(badges).size;
  if (count === 0) return null;
  return count === 1
    ? 'You earned a new badge. See it on your profile.'
    : `You earned ${count} new badges. See them on your profile.`;
}
