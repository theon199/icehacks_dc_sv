/**
 * Turns anything thrown by Supabase Auth (or by the network under it) into one of a few kinds the
 * screens know how to present. Matching is by `code`, `status` and `name` rather than by class, so
 * it keeps working across library versions and for errors that crossed an async boundary.
 */
import { isApiError } from '@/lib/api/errors';

export type AuthFailureKind =
  | 'offline'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'weak_password'
  | 'invalid_email'
  | 'user_exists'
  | 'link_expired'
  | 'signups_disabled'
  | 'same_password'
  | 'session_missing'
  | 'provider_failed'
  | 'unknown';

export interface AuthFailure {
  kind: AuthFailureKind;
  /** Safe, friendly copy for the person using the app. */
  message: string;
}

const messages: Record<AuthFailureKind, string> = {
  offline: 'You’re offline or the connection dropped. Check your connection and try again.',
  invalid_credentials: 'That email and password don’t match. Check them and try again.',
  email_not_confirmed: 'Please confirm your email first. We can send the link again.',
  rate_limited: 'Too many attempts for now. Wait a minute, then try again.',
  weak_password: 'That password is too easy to guess. Try a longer or less common one.',
  invalid_email: 'That email address can’t be used. Check it and try again.',
  user_exists: 'An account with that email already exists. Try signing in instead.',
  link_expired:
    'That link has expired, was already used, or was opened on another device. Request a new one.',
  signups_disabled: 'New accounts can’t be created right now. Please try again later.',
  same_password: 'Your new password must be different from the old one.',
  session_missing: 'Your session has ended. Please sign in again.',
  provider_failed: 'We couldn’t finish signing you in. Please try again.',
  unknown: 'Something went wrong. Please try again in a moment.',
};

const codeKinds: Record<string, AuthFailureKind> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
  over_sms_send_rate_limit: 'rate_limited',
  weak_password: 'weak_password',
  email_address_invalid: 'invalid_email',
  email_address_not_authorized: 'invalid_email',
  validation_failed: 'invalid_email',
  user_already_exists: 'user_exists',
  email_exists: 'user_exists',
  otp_expired: 'link_expired',
  flow_state_expired: 'link_expired',
  flow_state_not_found: 'link_expired',
  bad_code_verifier: 'link_expired',
  bad_oauth_state: 'link_expired',
  signup_disabled: 'signups_disabled',
  email_provider_disabled: 'signups_disabled',
  same_password: 'same_password',
  session_not_found: 'session_missing',
  session_expired: 'session_missing',
  refresh_token_not_found: 'session_missing',
  bad_jwt: 'session_missing',
  user_not_found: 'session_missing',
  provider_disabled: 'provider_failed',
  bad_oauth_callback: 'provider_failed',
  provider_email_needs_verification: 'email_not_confirmed',
};

function field(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null ? Reflect.get(error, key) : undefined;
}

function classify(error: unknown): AuthFailureKind {
  if (isApiError(error)) {
    if (error.kind === 'network' || error.kind === 'timeout') return 'offline';
    if (error.kind === 'rate_limited') return 'rate_limited';
    if (error.kind === 'unauthorized') return 'session_missing';
    return 'unknown';
  }

  const code = field(error, 'code');
  if (typeof code === 'string' && code in codeKinds) return codeKinds[code] ?? 'unknown';

  const name = field(error, 'name');
  const status = field(error, 'status');
  const message = String(field(error, 'message') ?? '');

  if (name === 'AuthRetryableFetchError' || name === 'AbortError') return 'offline';
  if (error instanceof TypeError && /network|fetch/i.test(message)) return 'offline';
  if (name === 'AuthSessionMissingError') return 'session_missing';
  if (name === 'AuthWeakPasswordError') return 'weak_password';
  if (name === 'AuthPKCEGrantCodeExchangeError') return 'link_expired';
  if (name === 'AuthPKCECodeVerifierMissingError') return 'link_expired';
  if (status === 429) return 'rate_limited';
  // Servers that predate error codes still say this in the message.
  if (/invalid login credentials/i.test(message)) return 'invalid_credentials';
  if (/email not confirmed/i.test(message)) return 'email_not_confirmed';
  if (/network request failed|failed to fetch/i.test(message)) return 'offline';
  return 'unknown';
}

export function describeAuthError(error: unknown): AuthFailure {
  const kind = classify(error);
  return { kind, message: messages[kind] };
}

export function authFailure(kind: AuthFailureKind): AuthFailure {
  return { kind, message: messages[kind] };
}
