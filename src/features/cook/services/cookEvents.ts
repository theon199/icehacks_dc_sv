/**
 * The `record_cook_event` RPC: tells the server someone cooked a dish so their stats, streak and
 * badges update. The call is idempotent per `clientEventId`, which makes retries safe.
 */
import { z } from 'zod';

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

export async function recordCookEvent(request: CookEventRequest): Promise<CookEventResponse> {
  const { data, error } = await supabase.rpc('record_cook_event', {
    p_recipe_ref: request.recipeRef,
    p_local_date: request.localDate,
    p_cooked_at: request.cookedAt,
    p_client_event_id: request.clientEventId,
    ...(request.cuisine !== null ? { p_cuisine: request.cuisine } : {}),
    ...(request.rating !== null ? { p_rating: request.rating } : {}),
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
 * Codes the server uses for requests that will never succeed as sent: bad input (`22023`, or any
 * other data exception) and the daily cook limit (`PT429`). Everything else, including a dropped
 * connection or an expired session, is worth retrying later.
 */
export function classifyCookEventError(error: unknown): CookEventFailure {
  if (!(error instanceof CookEventError) || error.code === null) return 'retry';
  const code = error.code;
  if (code === 'invalid_response' || code === 'PT429' || code.startsWith('22')) return 'drop';
  return 'retry';
}
