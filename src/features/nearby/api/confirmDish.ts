/**
 * The `confirm_dish` RPC: records whether a place had the dish and returns the new tally.
 */
import { z } from 'zod';

import { supabase } from '@/lib/supabase/client';

import type { Tally } from '../model/confirmations';

const tallySchema = z
  .object({
    place_id: z.string(),
    dish_key: z.string(),
    yes_count: z.number().int().nonnegative(),
    no_count: z.number().int().nonnegative(),
    my_answer: z.boolean(),
  })
  .transform((row) => ({
    yesCount: row.yes_count,
    noCount: row.no_count,
    myAnswer: row.my_answer,
  }));

export type ConfirmFailure = 'rate_limited' | 'signed_out' | 'failed';

export class ConfirmDishError extends Error {
  readonly reason: ConfirmFailure;
  constructor(reason: ConfirmFailure, options?: { cause?: unknown }) {
    super(`confirm_dish: ${reason}`, options);
    this.name = 'ConfirmDishError';
    this.reason = reason;
  }

  get userMessage(): string {
    if (this.reason === 'rate_limited') return "You've answered a lot just now. Try again later.";
    if (this.reason === 'signed_out') return 'Please sign in again to answer.';
    return "Your answer didn't save. Please try again.";
  }
}

interface RpcError {
  code?: string;
  message?: string;
}

export function classifyRpcError(error: RpcError): ConfirmFailure {
  if (error.code === 'PT429' || error.message === 'rate_limited') return 'rate_limited';
  if (error.code === 'PT401' || error.code === '28000' || error.message === 'not_authenticated') {
    return 'signed_out';
  }
  return 'failed';
}

export interface ConfirmDishInput {
  placeId: string;
  dishKey: string;
  hadIt: boolean;
}

export async function confirmDish(input: ConfirmDishInput): Promise<Tally> {
  let response;
  try {
    response = await supabase.rpc('confirm_dish', {
      p_place_id: input.placeId,
      p_dish_key: input.dishKey,
      p_had_it: input.hadIt,
    });
  } catch (cause) {
    throw new ConfirmDishError('failed', { cause });
  }
  if (response.error) {
    throw new ConfirmDishError(classifyRpcError(response.error), { cause: response.error });
  }
  const parsed = tallySchema.safeParse(response.data);
  if (!parsed.success) throw new ConfirmDishError('failed', { cause: parsed.error });
  return parsed.data;
}
