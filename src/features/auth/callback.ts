/**
 * Understands the links that come back into the app at `famara://auth/callback`: the PKCE code from
 * an email confirmation, a password-recovery email or the Google OAuth redirect, a `token_hash`
 * from email templates that use one, or an error the auth server reported instead.
 */
import { authFailure, describeAuthError, type AuthFailure } from './authErrors';

/** Where every auth email and OAuth flow returns to. Must be in Supabase's redirect allow list. */
export const AUTH_CALLBACK_URL = 'famara://auth/callback';
/** Recovery links carry this marker so the callback knows to ask for a new password. */
export const RECOVERY_CALLBACK_URL = `${AUTH_CALLBACK_URL}?flow=recovery`;

const OTP_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'] as const;
export type CallbackOtpType = (typeof OTP_TYPES)[number];

export type CallbackAction =
  | { kind: 'exchange'; code: string; flowId: string | null; recovery: boolean }
  | { kind: 'verify'; tokenHash: string; type: CallbackOtpType; recovery: boolean }
  | { kind: 'error'; failure: AuthFailure }
  | { kind: 'none' };

function isOtpType(value: string | undefined): value is CallbackOtpType {
  return OTP_TYPES.some((type) => type === value);
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function parsePairs(source: string, into: Record<string, string>): void {
  for (const pair of source.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decode(eq === -1 ? pair : pair.slice(0, eq));
    const value = eq === -1 ? '' : decode(pair.slice(eq + 1));
    if (key && !(key in into)) into[key] = value;
  }
}

/**
 * Reads query and fragment parameters from a URL. Written by hand because the URL implementation
 * in React Native does not reliably support custom schemes.
 */
export function paramsFromUrl(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex !== -1) parsePairs(beforeHash.slice(queryIndex + 1), params);
  if (hashIndex !== -1) parsePairs(url.slice(hashIndex + 1), params);
  return params;
}

/** Decides what the callback screen should do with the parameters it was opened with. */
export function readCallback(params: Record<string, string | undefined>): CallbackAction {
  const recovery = params.flow === 'recovery' || params.type === 'recovery';

  if (params.error || params.error_code) {
    const code = params.error_code ?? params.error;
    const failure = describeAuthError({ code, message: params.error_description ?? '' });
    // The provider's own wording is not shown: it can be technical or in another language.
    return {
      kind: 'error',
      failure: failure.kind === 'unknown' ? authFailure('provider_failed') : failure,
    };
  }

  if (params.code) {
    // The auth library tags each PKCE flow so the right stored verifier is used for this code.
    return { kind: 'exchange', code: params.code, flowId: params.sb_flow_id ?? null, recovery };
  }

  if (params.token_hash && isOtpType(params.type)) {
    return { kind: 'verify', tokenHash: params.token_hash, type: params.type, recovery };
  }

  return { kind: 'none' };
}
