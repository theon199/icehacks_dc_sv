/**
 * Sign in with Apple and with Google.
 *
 * Apple: the native sheet returns an identity token bound to a SHA-256 of a one-time nonce; the raw
 * nonce goes to Supabase, which checks the hash. Google: Supabase starts a PKCE OAuth flow, the
 * system auth session shows Google's page and returns to `famara://auth/callback`, and the code in
 * that URL is exchanged for a session.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { logger } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase/client';

import { completeCallback, hasSession } from './authActions';
import { authFailure, describeAuthError, type AuthFailure } from './authErrors';
import { AUTH_CALLBACK_URL, paramsFromUrl, readCallback } from './callback';

export type ProviderResult =
  { status: 'signedIn' } | { status: 'cancelled' } | { status: 'failed'; failure: AuthFailure };

const APPLE_CANCELLED = 'ERR_REQUEST_CANCELED';

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Joins the parts of the name Apple shares (only on the very first sign-in). */
export function appleDisplayName(
  name: AppleAuthentication.AppleAuthenticationFullName | null | undefined,
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

export async function signInWithApple(): Promise<ProviderResult> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  const rawNonce = toHex(Crypto.getRandomBytes(32));
  try {
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (Reflect.get(Object(error), 'code') === APPLE_CANCELLED) return { status: 'cancelled' };
    logger.warn('Apple sign-in sheet failed', { error: String(error) });
    return { status: 'failed', failure: authFailure('provider_failed') };
  }

  if (!credential.identityToken) {
    return { status: 'failed', failure: authFailure('provider_failed') };
  }

  try {
    const { error } = await getSupabase().auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;
  } catch (error) {
    return { status: 'failed', failure: describeAuthError(error) };
  }

  const name = appleDisplayName(credential.fullName);
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
    if (!data.url) return { status: 'failed', failure: authFailure('provider_failed') };
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
    return { status: 'failed', failure: authFailure('provider_failed') };
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
