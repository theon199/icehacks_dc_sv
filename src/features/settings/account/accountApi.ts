/**
 * Account operations behind the Account screen: who is signed in, changing email and password,
 * exporting data and deleting the account. All of them talk to Supabase Auth or the account RPCs
 * described in docs/BACKEND.md.
 */
import { z } from 'zod';

import {
  AUTH_CALLBACK_URL,
  accountErrorMessage,
  isAccountError,
  useSessionStore,
} from '@/features/auth';
import { describeError, logger } from '@/lib/logger';
import { queryClient } from '@/lib/query/client';
import { getSupabase } from '@/lib/supabase/client';

import { forgetAiConsentOnDevice } from '../aiConsent';
import {
  deleteSignedInAccount,
  endAuthSession,
  unregisterPushDevice,
  type SignOutScope,
} from '../deps';
import { discardLegacyAccount, migrateLegacySettings } from '../legacySettings';

export const MIN_PASSWORD_LENGTH = 8;

/** Words the person types to confirm account deletion. */
export const DELETE_CONFIRMATION_PHRASE = 'DELETE';

export interface AccountUser {
  id: string;
  email: string | null;
  /** Email change waiting for confirmation, if any. */
  pendingEmail: string | null;
  /** Whether the account can sign in with a password (as opposed to Apple or Google only). */
  hasPassword: boolean;
}

/** A failure with a sentence that is safe to show in the UI. */
export class AccountError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

const authErrorCopy: Record<string, string> = {
  email_exists: 'That email is already used by another account.',
  email_address_invalid: 'That email address does not look right.',
  same_password: 'Your new password must be different from the current one.',
  weak_password: 'Choose a longer password that is harder to guess.',
  reauthentication_needed: 'For your security, sign out and back in, then try again.',
  over_email_send_rate_limit: 'Too many emails were sent just now. Try again in a few minutes.',
  over_request_rate_limit: 'Too many attempts. Wait a moment and try again.',
  invalid_credentials: 'Your current password is not correct.',
};

function toAccountError(error: unknown, fallback: string): AccountError {
  if (error instanceof AccountError) return error;
  const code =
    typeof error === 'object' && error != null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'unknown';
  return new AccountError(code, authErrorCopy[code] ?? fallback);
}

/** Root of every react-query key Settings uses; cleared whenever this device signs out. */
export const SETTINGS_QUERY_ROOT = 'settings';

/** Account details are cached per user, so a second sign-in never reads the first person's. */
export const accountUserQueryKey = (userId: string | null) =>
  [SETTINGS_QUERY_ROOT, 'account-user', userId] as const;

/**
 * Marker written to user metadata when an Apple or Google account sets its first password. Auth
 * lists providers by linked identity, and adding a password does not link an email identity, so
 * without this the account would keep looking password-less.
 */
const PASSWORD_SET_FLAG = 'password_set';

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export async function fetchAccountUser(): Promise<AccountUser> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) throw toAccountError(error, 'Could not load your account.');
  const user = data.user;
  const providers = (user.app_metadata as { providers?: unknown }).providers;
  const providerList = Array.isArray(providers) ? providers : [user.app_metadata.provider];
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? null,
    pendingEmail: user.new_email ?? null,
    hasPassword: providerList.includes('email') || metadata[PASSWORD_SET_FLAG] === true,
  };
}

/**
 * Starts an email change. Supabase sends confirmation links; the change applies once they are
 * opened, which brings the person back through the auth callback route.
 */
export async function changeEmail(newEmail: string): Promise<void> {
  const email = newEmail.trim();
  if (!isValidEmail(email)) {
    throw new AccountError('email_address_invalid', authErrorCopy.email_address_invalid ?? '');
  }
  const { error } = await getSupabase().auth.updateUser(
    { email },
    // The fixed callback, which is the one on the auth redirect allow list in every build.
    { emailRedirectTo: AUTH_CALLBACK_URL },
  );
  if (error) throw toAccountError(error, 'Could not change your email. Try again.');
}

export interface PasswordChange {
  email: string | null;
  /** Required when the account already has a password. */
  currentPassword: string | null;
  newPassword: string;
}

export async function changePassword({
  email,
  currentPassword,
  newPassword,
}: PasswordChange): Promise<void> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AccountError(
      'weak_password',
      `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
    );
  }
  const client = getSupabase();
  if (currentPassword != null) {
    // Confirm it is really the account holder before replacing the password.
    if (!email) throw new AccountError('no_email', 'Your account has no email address.');
    const check = await client.auth.signInWithPassword({ email, password: currentPassword });
    if (check.error) throw toAccountError(check.error, authErrorCopy.invalid_credentials ?? '');
  }
  const { error } = await client.auth.updateUser(
    currentPassword == null
      ? { password: newPassword, data: { [PASSWORD_SET_FLAG]: true } }
      : { password: newPassword },
  );
  if (error) throw toAccountError(error, 'Could not change your password. Try again.');
}

const exportSchema = z.record(z.string(), z.unknown());

/** Everything the server stores about the signed-in account (`export_my_data`). */
export async function fetchServerExport(): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase().rpc('export_my_data');
  if (error) throw toAccountError(error, 'Could not gather your data. Try again.');
  const parsed = exportSchema.safeParse(data);
  if (!parsed.success) throw new AccountError('invalid_response', 'The export came back empty.');
  return parsed.data;
}

const DELETE_FAILED = 'Could not delete your account. Try again.';

/**
 * Deletes the account through the auth feature, which removes it on the server and then stops
 * sync and wipes this device's copy of the account's data without pushing anything. The session
 * is then ended on this device. The server removes the account's push devices along with it, so
 * there is nothing to unregister.
 *
 * Once the server has deleted the account, a failure in the local cleanup is logged and sign-out
 * carries on: staying signed in to an account that no longer exists helps no one, and the wipe
 * also runs when the session ends.
 */
export async function deleteAccount(): Promise<void> {
  const userId = useSessionStore.getState().userId;
  if (!userId) throw new AccountError('signed_out', 'Your session has ended. Sign in again.');
  try {
    await deleteSignedInAccount(userId);
  } catch (error) {
    // The auth feature reports every failure before or of the deletion call as an AccountError;
    // anything else comes from the cleanup after the account was already deleted.
    if (isAccountError(error)) {
      throw new AccountError(
        error.kind,
        error.kind === 'server' ? DELETE_FAILED : accountErrorMessage(error),
      );
    }
    logger.error('Account deleted, but clearing this device failed', describeError(error));
  }
  // The deleted account's own old answers and unsent AI withdrawal have nowhere to go; other
  // accounts' are left alone.
  await discardLegacyAccount(userId);
  await forgetAiConsentOnDevice(userId);
  await finishSignOut(signOutHere);
}

/** How long sign-out waits for the push service before carrying on without it. */
export const PUSH_UNREGISTER_TIMEOUT_MS = 3000;

/** Runs `work` but stops waiting after `ms`; never rejects. */
async function bestEffort(work: () => Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([work().catch(() => undefined), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** A local sign-out, with a thrown error reported the same way as a returned one. */
async function signOutHere(): Promise<unknown> {
  try {
    const { error } = await getSupabase().auth.signOut({ scope: 'local' });
    return error ?? null;
  } catch (error) {
    return error;
  }
}

/** True when this device no longer stores a session. */
async function sessionCleared(): Promise<boolean> {
  try {
    const { data, error } = await getSupabase().auth.getSession();
    return !error && data.session == null;
  } catch {
    return false;
  }
}

/**
 * Runs `end`, then makes sure the session is really gone from this device. Supabase reports a
 * failed revocation (offline, server error) through `error` rather than by throwing, and the
 * stored session can survive it; a `local` sign-out then removes it without needing the network.
 * Success is only claimed after checking that no session is left to restore on the next launch.
 */
async function clearSession(end: () => Promise<unknown>): Promise<boolean> {
  try {
    const error = await end();
    if (error != null) logger.warn('Sign-out could not revoke the session', describeError(error));
  } catch (error) {
    logger.warn('Sign-out could not revoke the session', describeError(error));
  }
  if (await sessionCleared()) return true;
  const retry = await signOutHere();
  if (retry != null) logger.warn('Local sign-out failed', describeError(retry));
  return sessionCleared();
}

async function finishSignOut(end: () => Promise<unknown>): Promise<void> {
  if (!(await clearSession(end))) {
    throw new AccountError('sign_out_failed', 'Could not sign out on this device. Try again.');
  }
  queryClient.removeQueries({ queryKey: [SETTINGS_QUERY_ROOT] });
  useSessionStore.getState().signedOut();
}

export interface SignOutOutcome {
  /** True when other devices were signed out too (only ever for `global`). */
  everywhere: boolean;
}

/**
 * Signs out and drops the cached account details so the next person starts clean.
 *
 * The device's push registration is removed first, while the session can still authorise that
 * request, so the next person on this phone does not get this account's notifications; it is
 * best effort and gives up after a few seconds so sign-out still works offline. The session is
 * then ended by the auth feature (pending sync is sent and user data on the device is wiped), for
 * this device only unless `scope` is `global`, and checked to be gone.
 * Throws an `AccountError` when the stored session could not be removed.
 */
export async function signOutOfAccount(scope: SignOutScope): Promise<SignOutOutcome> {
  const userId = useSessionStore.getState().userId;
  await bestEffort(unregisterPushDevice, PUSH_UNREGISTER_TIMEOUT_MS);
  // Old answers this account still has on the device are moved now, while sync can send them.
  // When that is not safe yet they stay, to be moved on the account's next sign-in here.
  if (userId) {
    await migrateLegacySettings(userId).catch((error: unknown) => {
      logger.warn('Could not move old Settings answers before signing out', describeError(error));
    });
  }
  let everywhere = false;
  await finishSignOut(async () => {
    everywhere = await endAuthSession(scope);
    return null;
  });
  return { everywhere };
}

/** Ends this device's session only; other devices stay signed in. */
export async function signOutLocally(): Promise<void> {
  await signOutOfAccount('local');
}

/** Ends every session of the account, this device's included. */
export function signOutEverywhere(): Promise<SignOutOutcome> {
  return signOutOfAccount('global');
}
