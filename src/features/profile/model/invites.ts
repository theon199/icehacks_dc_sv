/**
 * Friend invite codes, links, share text and the outcomes of redeeming one.
 *
 * Codes are 10 characters from an alphabet without look-alike characters; the server compares them
 * case-insensitively. A link has the form `famara://invite/<code>`.
 */
import { isApiError } from '@/lib/api/errors';

export const INVITE_CODE_LENGTH = 10;
export const INVITE_CODE_PATTERN = /^[A-Z2-9]{10}$/;
export const INVITE_LINK_PREFIX = 'famara://invite/';

/**
 * Reads a code typed or pasted by a person: tolerates spaces, dashes, lower case and a whole
 * invite link. Returns null when no valid code can be found.
 */
export function normalizeInviteCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const fromLink = /invite\/([A-Za-z0-9]{10})(?![A-Za-z0-9])/.exec(raw);
  const candidate = (fromLink?.[1] ?? raw).replace(/[\s-]+/g, '').toUpperCase();
  return INVITE_CODE_PATTERN.test(candidate) ? candidate : null;
}

export function inviteLink(code: string): string {
  return `${INVITE_LINK_PREFIX}${code}`;
}

/** Groups a code for reading aloud or typing: "ABCDE FGHJK". */
export function displayInviteCode(code: string): string {
  return code.length === INVITE_CODE_LENGTH ? `${code.slice(0, 5)} ${code.slice(5)}` : code;
}

function dayCountUntil(expiresAt: string, now: Date): number | null {
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  return Math.ceil((end - now.getTime()) / 86_400_000);
}

/** "Expires in 6 days", "Expires within a day", "Expired". */
export function inviteExpiryLabel(expiresAt: string, now: Date): string {
  const days = dayCountUntil(expiresAt, now);
  if (days == null) return 'Expiry unknown';
  if (Date.parse(expiresAt) <= now.getTime()) return 'Expired';
  if (days <= 1) return 'Expires within a day';
  return `Expires in ${days} days`;
}

/**
 * Text for the share sheet. It carries the link and the bare code, so it still works when the
 * receiving app does not turn custom links into something tappable.
 */
export function inviteShareMessage(code: string, expiresAt: string, now: Date): string {
  const days = dayCountUntil(expiresAt, now);
  const validity =
    days != null && days > 1 ? `It works once and expires in ${days} days.` : 'It works once.';
  return [
    'Cook with me on Famara! Tap to connect:',
    inviteLink(code),
    '',
    `Or open Famara, go to Friends and enter the code ${displayInviteCode(code)}. ${validity}`,
  ].join('\n');
}

export type RedeemFailure =
  | 'invalid_or_expired'
  | 'already_used'
  | 'own_invite'
  | 'not_eligible'
  | 'offline'
  | 'rate_limited'
  | 'unknown';

/** Sorts a failed redemption into a state the screen can explain. */
export function classifyRedeemError(error: unknown): RedeemFailure {
  if (!isApiError(error)) return 'unknown';
  switch (error.code) {
    case 'invite_not_found':
      return 'invalid_or_expired';
    case 'invite_used':
      return 'already_used';
    case 'invalid_target':
      return 'own_invite';
    case 'age_gate_required':
    case 'underage':
    case 'suspended':
    case 'profile_missing':
      return 'not_eligible';
    default:
      break;
  }
  if (error.kind === 'network' || error.kind === 'timeout') return 'offline';
  if (error.kind === 'rate_limited') return 'rate_limited';
  if (error.kind === 'forbidden') return 'not_eligible';
  if (error.status === 404) return 'invalid_or_expired';
  if (error.status === 409) return 'already_used';
  return 'unknown';
}

export interface RedeemFailureCopy {
  title: string;
  message: string;
  /** Whether trying the same code again could work. */
  retryable: boolean;
}

export function redeemFailureCopy(
  failure: RedeemFailure,
  serverMessage?: string,
): RedeemFailureCopy {
  switch (failure) {
    case 'invalid_or_expired':
      return {
        title: 'This invite has expired',
        message:
          'Invites last 7 days, and this one has run out or is not valid. Ask your friend to send a new link.',
        retryable: false,
      };
    case 'already_used':
      return {
        title: 'This invite was already used',
        message: 'Each invite connects one person. Ask your friend for a fresh link.',
        retryable: false,
      };
    case 'own_invite':
      return {
        title: 'This is your own invite',
        message: 'Share it with a friend instead. When they open it, you will be connected.',
        retryable: false,
      };
    case 'not_eligible':
      return {
        title: "Friends aren't available yet",
        message: serverMessage ?? 'Your account cannot connect with friends right now.',
        retryable: false,
      };
    case 'offline':
      return {
        title: "You're offline",
        message: 'Check your connection and try again. The invite is still waiting for you.',
        retryable: true,
      };
    case 'rate_limited':
      return {
        title: 'Too many tries',
        message: 'Please wait a little while, then try again.',
        retryable: true,
      };
    case 'unknown':
      return {
        title: "That didn't work",
        message: 'Something went wrong while accepting the invite. Please try again.',
        retryable: true,
      };
  }
}
