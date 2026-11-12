/**
 * Every call Famara makes to Supabase Auth, wrapped so screens get a plain result instead of
 * having to interpret library errors. Session changes reach the app through `onAuthStateChange`
 * (see `useSessionBootstrap`), so none of these touch the session store directly.
 */
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase/client';

import { authFailure, describeAuthError, type AuthFailure } from './authErrors';
import { AUTH_CALLBACK_URL, type CallbackAction } from './callback';
import { normalizeEmail } from './validation';

/** Version of the Terms and Privacy Policy someone agrees to when creating an account. */
export const TERMS_VERSION = '2026-11-01';

export type ActionResult<T = undefined> =
  { ok: true; value: T } | { ok: false; failure: AuthFailure };

function ok<T>(value: T): ActionResult<T> {
  return { ok: true, value };
}

function failed<T>(error: unknown, context: string): ActionResult<T> {
  const failure = describeAuthError(error);
  if (failure.kind === 'unknown') logger.warn(`Auth: ${context} failed`, { error: String(error) });
  return { ok: false, failure };
}

async function attempt<T>(context: string, run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await run());
  } catch (error) {
    return failed(error, context);
  }
}

export async function signInWithEmail(email: string, password: string): Promise<ActionResult> {
  return attempt('email sign-in', async () => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) throw error;
    return undefined;
  });
}

export interface SignUpOutcome {
  /** True when the account must be confirmed from the email before it can sign in. */
  needsConfirmation: boolean;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  acceptedAt: Date = new Date(),
): Promise<ActionResult<SignUpOutcome>> {
  return attempt('sign-up', async () => {
    const { data, error } = await getSupabase().auth.signUp({
      email: normalizeEmail(email),
      password,
      options: {
        emailRedirectTo: AUTH_CALLBACK_URL,
        data: { terms_version: TERMS_VERSION, terms_accepted_at: acceptedAt.toISOString() },
      },
    });
    if (error) throw error;
    // Without a session the project requires confirmation. An address that is already registered
    // also comes back this way, so the screen never reveals whether an account exists.
    return { needsConfirmation: data.session == null };
  });
}

export async function resendConfirmation(email: string): Promise<ActionResult> {
  return attempt('resend confirmation', async () => {
    const { error } = await getSupabase().auth.resend({
      type: 'signup',
      email: normalizeEmail(email),
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    if (error) throw error;
    return undefined;
  });
}

export async function requestPasswordReset(email: string): Promise<ActionResult> {
  return attempt('password reset request', async () => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: AUTH_CALLBACK_URL,
    });
    if (error) throw error;
    return undefined;
  });
}

export async function updatePassword(password: string): Promise<ActionResult> {
  return attempt('password update', async () => {
    const { error } = await getSupabase().auth.updateUser({ password });
    if (error) throw error;
    return undefined;
  });
}

export async function hasSession(): Promise<boolean> {
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session != null;
  } catch {
    return false;
  }
}

/**
 * Asks the auth server whether the stored session is still valid. Only a definite refusal counts:
 * offline or a server hiccup answers false, so local data is never wiped on a guess.
 */
export async function sessionRejectedByServer(): Promise<boolean> {
  try {
    const { data, error } = await getSupabase().auth.getUser();
    if (!error) return data.user == null;
    return error.status === 401 || error.status === 403;
  } catch {
    return false;
  }
}

/**
 * The auth library adds the kind of flow the stored code verifier belonged to (`recovery` for a
 * password link), which its published types leave out.
 */
const exchangeExtras = z.object({ redirectType: z.string().nullish() });

export interface CallbackOutcome {
  /** The link was a password recovery: ask for a new password next. */
  recovery: boolean;
}

/** Turns a callback link into a session. */
export async function completeCallback(
  action: CallbackAction,
): Promise<ActionResult<CallbackOutcome>> {
  if (action.kind === 'error') return { ok: false, failure: action.failure };
  if (action.kind === 'none') return { ok: false, failure: authFailure('link_expired') };
  return attempt('auth callback', async () => {
    const auth = getSupabase().auth;
    if (action.kind === 'exchange') {
      const { data, error } = await auth.exchangeCodeForSession(
        action.code,
        action.flowId ? { flowId: action.flowId } : undefined,
      );
      if (error) throw error;
      const extras = exchangeExtras.safeParse(data);
      const viaRecovery = extras.success && extras.data.redirectType === 'recovery';
      return { recovery: action.recovery || viaRecovery };
    }
    const { error } = await auth.verifyOtp({ token_hash: action.tokenHash, type: action.type });
    if (error) throw error;
    return { recovery: action.recovery };
  });
}

/**
 * Signs out everywhere when possible. Offline, or when the server no longer knows the session,
 * the session is still dropped from this device so the person is never stuck signed in.
 */
export async function signOut(): Promise<void> {
  const auth = getSupabase().auth;
  try {
    const { error } = await auth.signOut();
    if (!error) return;
    logger.info('Global sign-out failed; signing out on this device', { error: error.message });
  } catch (error) {
    logger.info('Global sign-out threw; signing out on this device', { error: String(error) });
  }
  try {
    await auth.signOut({ scope: 'local' });
  } catch (error) {
    logger.warn('Local sign-out failed', { error: String(error) });
  }
}
