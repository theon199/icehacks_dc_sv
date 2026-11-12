/**
 * Account RPCs the session needs: the age gate record, and deleting the account. The server is the
 * source of truth for the birth year; local copies are only a launch hint.
 */
import { z } from 'zod';

import { getSupabase } from '@/lib/supabase/client';

import { aiConsent } from './deps';
import { forgetCachedSetup } from './profileCache';

export type AccountErrorKind =
  | 'offline'
  | 'signed_out'
  | 'account_changed'
  | 'birth_year_locked'
  | 'invalid_birth_year'
  | 'rate_limited'
  | 'server';

export class AccountError extends Error {
  readonly kind: AccountErrorKind;

  constructor(kind: AccountErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AccountError';
    this.kind = kind;
  }
}

export function isAccountError(error: unknown): error is AccountError {
  return error instanceof AccountError;
}

const accountMessages: Record<AccountErrorKind, string> = {
  offline: 'You’re offline. Check your connection and try again.',
  signed_out: 'Your session has ended. Please sign in again.',
  account_changed: 'A different account is signed in now, so nothing was changed.',
  birth_year_locked:
    'Your birth year is already on record and can only be changed by contacting support.',
  invalid_birth_year: 'Please choose a real birth year.',
  rate_limited: 'Too many attempts for now. Please wait a moment and try again.',
  server: 'Something went wrong on our side. Please try again shortly.',
};

export function accountErrorMessage(error: unknown): string {
  return isAccountError(error) ? accountMessages[error.kind] : accountMessages.server;
}

const accountStatusSchema = z.object({
  user_id: z.string(),
  has_birth_year: z.boolean(),
  age_years: z.number().int().nullable(),
  is_adult: z.boolean(),
  is_underage: z.boolean(),
});

export interface AccountStatus {
  userId: string;
  hasBirthYear: boolean;
  /** Smallest age the person can be today, or null when no birth year is recorded. */
  ageYears: number | null;
  isAdult: boolean;
  /** True while the person may still be under 13. */
  isUnderage: boolean;
}

const deletionSchema = z.object({ deleted: z.literal(true) });

interface RpcFailure {
  code?: string;
  message?: string;
  status?: number;
}

function toAccountError(failure: RpcFailure, cause: unknown): AccountError {
  const message = failure.message ?? '';
  const code = failure.code ?? '';
  let kind: AccountErrorKind = 'server';
  if (message === 'birth_year_locked') kind = 'birth_year_locked';
  else if (message === 'invalid_birth_year' || code === '22023') kind = 'invalid_birth_year';
  else if (code === 'PT401' || code === 'PGRST301' || failure.status === 401) kind = 'signed_out';
  else if (code === 'PT429' || failure.status === 429) kind = 'rate_limited';
  else if (!code && /network|fetch|timed? ?out|abort/i.test(message)) kind = 'offline';
  return new AccountError(kind, accountMessages[kind], { cause });
}

/**
 * A signed-in account together with the access token it had when it was looked up. Calls made
 * "as" an identity carry that token, so they act on that account even if someone else signs in on
 * this device while the call is pending.
 */
export interface AccountIdentity {
  userId: string;
  accessToken: string;
}

/** The current session's identity, provided it still belongs to `userId`. */
export async function identityFor(userId: string): Promise<AccountIdentity> {
  let session;
  try {
    ({
      data: { session },
    } = await getSupabase().auth.getSession());
  } catch (cause) {
    throw toAccountError({ message: String(cause) }, cause);
  }
  if (!session) throw new AccountError('signed_out', accountMessages.signed_out);
  if (session.user.id !== userId) {
    throw new AccountError('account_changed', accountMessages.account_changed);
  }
  return { userId, accessToken: session.access_token };
}

interface RpcCall {
  name: string;
  args?: Record<string, unknown>;
  /** Run with this identity's token instead of whichever session is current. */
  as?: AccountIdentity | undefined;
}

async function callRpc<S extends z.ZodType>(call: RpcCall, schema: S): Promise<z.infer<S>> {
  let response: { data: unknown; error: RpcFailure | null; status?: number };
  try {
    const request = getSupabase().rpc(call.name, call.args);
    response = await (call.as
      ? request.setHeader('Authorization', `Bearer ${call.as.accessToken}`)
      : request);
  } catch (cause) {
    throw toAccountError({ message: String(cause) }, cause);
  }
  if (response.error) {
    throw toAccountError({ ...response.error, ...pickStatus(response.status) }, response.error);
  }
  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    throw new AccountError('server', accountMessages.server, { cause: parsed.error });
  }
  return parsed.data;
}

function pickStatus(status: number | undefined): { status?: number } {
  return status === undefined ? {} : { status };
}

function toStatus(raw: z.infer<typeof accountStatusSchema>): AccountStatus {
  return {
    userId: raw.user_id,
    hasBirthYear: raw.has_birth_year,
    ageYears: raw.age_years,
    isAdult: raw.is_adult,
    isUnderage: raw.is_underage,
  };
}

/** Reads the gate data for the signed-in person, or for `as` when given. */
export async function fetchAccountStatus(as?: AccountIdentity): Promise<AccountStatus> {
  return toStatus(await callRpc({ name: 'my_account_status', as }, accountStatusSchema));
}

/** Records the birth year. It can later move only to a more recent year. */
export async function saveBirthYear(birthYear: number): Promise<AccountStatus> {
  const call = { name: 'set_birth_year', args: { p_birth_year: birthYear } };
  return toStatus(await callRpc(call, accountStatusSchema));
}

/**
 * Deletes the given account and everything it owns on the server, then forgets this device's
 * launch hints for it. Uploaded files are only queued for removal (docs/BACKEND.md, storage), so
 * callers must not describe them as gone. The caller signs out afterwards.
 */
export async function deleteMyAccount(as: AccountIdentity): Promise<void> {
  await callRpc({ name: 'delete_my_account', as }, deletionSchema);
  forgetCachedSetup(as.userId);
  aiConsent.forget(as.userId);
}

/** Sets the public display name on the person's profile (1–50 characters). */
export async function updateDisplayName(userId: string, name: string): Promise<void> {
  const displayName = name.trim().slice(0, 50);
  if (!displayName) return;
  const { error } = await getSupabase()
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId);
  if (error) throw toAccountError(error, error);
}

/** A first name from what the sign-in provider shared, to prefill onboarding. */
export async function suggestedFirstName(): Promise<string | null> {
  try {
    const { data } = await getSupabase().auth.getSession();
    const meta: Record<string, unknown> = data.session?.user.user_metadata ?? {};
    for (const key of ['given_name', 'full_name', 'name']) {
      const value = meta[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim().split(/\s+/)[0]?.slice(0, 50) ?? null;
      }
    }
  } catch {
    // No suggestion is fine; the field simply starts empty.
  }
  return null;
}
