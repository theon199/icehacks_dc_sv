/**
 * The `record_cook_event` RPC: tells the server someone cooked a dish so their stats, streak and
 * badges update. The call is idempotent per `clientEventId`, which makes retries safe, and names
 * the account the cook belongs to, so the server refuses it if another account is signed in by the
 * time it is sent.
 */
import { z } from 'zod';

import { useSessionStore } from '@/features/auth';
import { supabase } from '@/lib/supabase/client';

import type { CookEventFailure, CookEventRequest, CookEventResponse } from '../logic/completion';

const responseSchema = z.object({
  event_id: z.string().min(1),
  new_badges: z.array(z.string()).default([]),
});

export class CookEventError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CookEventError';
    this.code = code;
  }
}

/**
 * Sends one cook. `expectedUserId` is the account that logged it; the server records nothing (and
 * answers with an account mismatch) when the request arrives under any other account. When it is
 * not given, the account signed in at the moment of the call is used: the session can still change
 * while the request waits for its access token, and that is the case the check exists for.
 */
export async function recordCookEvent(
  request: CookEventRequest,
  expectedUserId: string | null = useSessionStore.getState().userId,
): Promise<CookEventResponse> {
  const { data, error } = await supabase.rpc('record_cook_event', {
    p_recipe_ref: request.recipeRef,
    p_local_date: request.localDate,
    p_cooked_at: request.cookedAt,
    p_client_event_id: request.clientEventId,
    ...(request.cuisine !== null ? { p_cuisine: request.cuisine } : {}),
    ...(request.rating !== null ? { p_rating: request.rating } : {}),
    ...(expectedUserId !== null ? { p_expected_user: expectedUserId } : {}),
  });
  if (error) {
    throw new CookEventError(error.message, error.code || null, { cause: error });
  }
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success)
    throw new CookEventError('Unexpected cook event response', 'invalid_response');
  return { eventId: parsed.data.event_id, newBadges: parsed.data.new_badges };
}

/**
 * The server's answer when the cook was sent under another account than the one that logged it.
 * Nothing was recorded, and retrying cannot help: the cook only ever belongs to its own account.
 */
export function isAccountMismatch(error: unknown): boolean {
  return (
    error instanceof CookEventError &&
    error.code === 'PT409' &&
    error.message === 'account_mismatch'
  );
}

/** Server answers that mean "this cook will never be accepted as sent". */
const FINAL_REFUSALS = new Set([
  'invalid_response',
  // The account may not record cooks (suspended, or below the minimum age).
  'PT403',
  // The daily cook limit.
  'PT429',
]);

/**
 * Whether a failed cook event is worth sending again. Refusals that will not change with a retry
 * (the codes above, an account mismatch, and any data exception `22xxx` such as bad input) are
 * dropped; everything else, including a dropped connection or an expired session, is retried later.
 */
export function classifyCookEventError(error: unknown): CookEventFailure {
  if (!(error instanceof CookEventError) || error.code === null) return 'retry';
  if (isAccountMismatch(error)) return 'drop';
  return FINAL_REFUSALS.has(error.code) || error.code.startsWith('22') ? 'drop' : 'retry';
}
