/**
 * Sign in with Apple and with Google.
 *
 * Apple: the native sheet returns an identity token bound to a SHA-256 of a one-time nonce; the raw
 * nonce goes to Supabase, which checks the hash. Google: Supabase starts a PKCE OAuth flow, the
 * system auth session shows Google's page and returns to `famara://auth/callback`, and the code in
 * that URL is exchanged for a session.
 */
import {
  AppleAuthenticationScope,
  signInAsync as openAppleSheet,
  type AppleAuthenticationCredential,
  type AppleAuthenticationFullName,
} from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase/client';

import { createNoncePair } from './apple';
import { completeCallback, hasSession } from './authActions';
import { authFailure, describeAuthError, type AuthFailure } from './authErrors';
import { AUTH_CALLBACK_URL, paramsFromUrl, readCallback } from './callback';

export type ProviderResult =
  { status: 'signedIn' } | { status: 'cancelled' } | { status: 'failed'; failure: AuthFailure };

const providerFailed = (): ProviderResult => ({
  status: 'failed',
  failure: authFailure('provider_failed'),
});

/** Native module errors carry a string `code`; closing Apple's sheet reports this one. */
const nativeError = z.object({ code: z.string() });
const APPLE_SHEET_CLOSED = 'ERR_REQUEST_CANCELED';

function closedByPerson(error: unknown): boolean {
  const parsed = nativeError.safeParse(error);
  return parsed.success && parsed.data.code === APPLE_SHEET_CLOSED;
}

/** Joins the parts of the name Apple shares (only on the very first sign-in). */
export function appleDisplayName(
  name: AppleAuthenticationFullName | null | undefined,
): string | null {
  if (!name) return null;
  const joined = [name.givenName, name.middleName, name.familyName]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
    .join(' ');
  return joined ? joined.slice(0, 50) : null;
}

/** Saves the name Apple shared, so the profile is not left with a generated one. Best effort. */
async function rememberAppleName(name: string): Promise<void> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.auth.updateUser({ data: { full_name: name } });
    await supabase.from('profiles').update({ display_name: name }).eq('id', userId);
  } catch (error) {
    logger.info('Could not save the name from Apple', { error: String(error) });
  }
}

type AppleSheetOutcome =
  | { kind: 'credential'; credential: AppleAuthenticationCredential }
  | { kind: 'closed' }
  | { kind: 'broken' };

async function askApple(hashedNonce: string): Promise<AppleSheetOutcome> {
  try {
    const credential = await openAppleSheet({
      requestedScopes: [AppleAuthenticationScope.FULL_NAME, AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    return { kind: 'credential', credential };
  } catch (error) {
    if (closedByPerson(error)) return { kind: 'closed' };
    logger.warn('Apple sign-in sheet failed', { error: String(error) });
    return { kind: 'broken' };
  }
}

export async function signInWithApple(): Promise<ProviderResult> {
  let nonce;
  try {
    nonce = await createNoncePair();
  } catch (error) {
    logger.warn('Could not prepare Apple sign-in', { error: String(error) });
    return providerFailed();
  }

  const sheet = await askApple(nonce.hashed);
  if (sheet.kind === 'closed') return { status: 'cancelled' };
  if (sheet.kind === 'broken' || !sheet.credential.identityToken) return providerFailed();

  try {
    const { error } = await getSupabase().auth.signInWithIdToken({
      provider: 'apple',
      token: sheet.credential.identityToken,
      nonce: nonce.raw,
    });
    if (error) throw error;
  } catch (error) {
    return { status: 'failed', failure: describeAuthError(error) };
  }

  const name = appleDisplayName(sheet.credential.fullName);
  if (name) void rememberAppleName(name);
  return { status: 'signedIn' };
}

export async function signInWithGoogle(): Promise<ProviderResult> {
  let url: string;
  try {
    const { data, error } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: AUTH_CALLBACK_URL,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw error;
    if (!data.url) return providerFailed();
    url = data.url;
  } catch (error) {
    return { status: 'failed', failure: describeAuthError(error) };
  }

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(url, AUTH_CALLBACK_URL, {
      preferEphemeralSession: false,
    });
  } catch (error) {
    logger.warn('Google auth session failed to open', { error: String(error) });
    return providerFailed();
  }
  if (result.type !== 'success') return { status: 'cancelled' };

  const action = readCallback(paramsFromUrl(result.url));
  // Closing Google's page early comes back as an access_denied error rather than a dismissal.
  if (action.kind === 'error' && /access_denied/.test(result.url)) return { status: 'cancelled' };
  const outcome = await completeCallback(action);
  if (outcome.ok) return { status: 'signedIn' };
  // On Android the same redirect can also open the callback route, which may have used the code
  // first; a session existing means sign-in worked either way.
  if (await hasSession()) return { status: 'signedIn' };
  return { status: 'failed', failure: outcome.failure };
}
