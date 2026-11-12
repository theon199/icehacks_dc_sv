/**
 * Client for the `confirm_dish` database function. A member says whether a place served the dish;
 * the function stores that answer and replies with the place's updated counts.
 */
import { z } from 'zod';

import { supabase } from '@/lib/supabase/client';

import type { Tally } from '../model/confirmations';

const count = z.number().int().min(0);

/** The row the function returns, in its snake_case column names. */
const replySchema = z.object({
  place_id: z.string(),
  dish_key: z.string(),
  yes_count: count,
  no_count: count,
  my_answer: z.boolean(),
});

type Reply = z.infer<typeof replySchema>;

function toTally(reply: Reply): Tally {
  return { yesCount: reply.yes_count, noCount: reply.no_count, myAnswer: reply.my_answer };
}

export type ConfirmFailure = 'rate_limited' | 'signed_out' | 'failed';

const FAILURE_COPY: Record<ConfirmFailure, string> = {
  rate_limited: "You've answered a lot just now. Try again later.",
  signed_out: 'Please sign in again to answer.',
  failed: "Your answer didn't save. Please try again.",
};

export class ConfirmDishError extends Error {
  readonly reason: ConfirmFailure;

  constructor(reason: ConfirmFailure, options?: { cause?: unknown }) {
    super(`confirm_dish: ${reason}`, options);
    this.name = 'ConfirmDishError';
    this.reason = reason;
  }

  /** Copy for a toast. */
  get userMessage(): string {
    return FAILURE_COPY[this.reason];
  }
}

/** Error codes PostgREST and the function use, mapped to what the person can do about them. */
const RATE_LIMIT_SIGNALS = new Set(['PT429', 'rate_limited']);
const SIGNED_OUT_SIGNALS = new Set(['PT401', '28000', 'not_authenticated']);

export function classifyRpcError(error: { code?: string; message?: string }): ConfirmFailure {
  const signals = [error.code, error.message].filter((s): s is string => typeof s === 'string');
  if (signals.some((s) => RATE_LIMIT_SIGNALS.has(s))) return 'rate_limited';
  if (signals.some((s) => SIGNED_OUT_SIGNALS.has(s))) return 'signed_out';
  return 'failed';
}

export interface ConfirmDishInput {
  placeId: string;
  dishKey: string;
  hadIt: boolean;
}

async function send({ placeId, dishKey, hadIt }: ConfirmDishInput) {
  const args = { p_place_id: placeId, p_dish_key: dishKey, p_had_it: hadIt };
  try {
    return await supabase.rpc('confirm_dish', args);
  } catch (cause) {
    // Network failures and aborted requests land here rather than in `error`.
    throw new ConfirmDishError('failed', { cause });
  }
}

/** Sends one answer. Rejects with a `ConfirmDishError` for every kind of failure. */
export async function confirmDish(input: ConfirmDishInput): Promise<Tally> {
  const outcome = await send(input);
  if (outcome.error) {
    throw new ConfirmDishError(classifyRpcError(outcome.error), { cause: outcome.error });
  }
  const checked = replySchema.safeParse(outcome.data);
  if (!checked.success) throw new ConfirmDishError('failed', { cause: checked.error });
  return toTally(checked.data);
}
