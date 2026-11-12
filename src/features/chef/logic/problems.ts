/**
 * What to tell the person when an AI request fails, and whether offering "Try again" makes sense.
 * Limits get their own wording: a spent daily allowance cannot be retried until it resets, while a
 * short burst limit clears in seconds.
 */
import { isAiAgeRestricted, isAiQuotaExceeded, isAiRefused } from '@/lib/api/ai';
import { isApiError } from '@/lib/api/errors';

export type AiProblemKind =
  | 'daily_limit'
  | 'busy'
  | 'age'
  | 'declined'
  | 'offline'
  | 'slow'
  | 'signed_out'
  | 'rejected'
  | 'unknown';

export interface AiProblem {
  readonly kind: AiProblemKind;
  readonly title: string;
  readonly message: string;
  /** Whether sending the same request again could work right away. */
  readonly canRetry: boolean;
}

/** "in about 3 hours", "in about 20 minutes", "in under a minute". */
export function waitPhrase(seconds: number | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return 'in under a minute';
  if (seconds < 90 * 60) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return `in about ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.round(seconds / 3600);
  return `in about ${hours} hour${hours === 1 ? '' : 's'}`;
}

export interface ProblemCopy {
  /** Feature name used in messages, e.g. "Chef". */
  readonly feature: string;
  /** What a daily allowance counts, e.g. "questions" or "makeovers". */
  readonly unit: string;
}

const CHEF_COPY: ProblemCopy = { feature: 'Chef', unit: 'questions' };

export function describeAiProblem(error: unknown, copy: ProblemCopy = CHEF_COPY): AiProblem {
  const { feature, unit } = copy;
  if (isAiQuotaExceeded(error)) {
    const when = waitPhrase(error.retryAfterSeconds);
    return {
      kind: 'daily_limit',
      title: `You've reached today's ${feature} limit`,
      message: when
        ? `Your ${unit} refresh ${when}. Everything else in Famara keeps working meanwhile.`
        : `Your ${unit} refresh when your daily allowance resets. Everything else in Famara keeps working meanwhile.`,
      canRetry: false,
    };
  }
  if (isAiAgeRestricted(error)) {
    return {
      kind: 'age',
      title: `${feature} is for adults`,
      message: 'AI features are available from age 18.',
      canRetry: false,
    };
  }
  if (isAiRefused(error)) {
    return {
      kind: 'declined',
      title: `${feature} couldn't answer that`,
      message: 'Try asking in a different way, or about a different dish.',
      canRetry: true,
    };
  }
  if (!isApiError(error)) {
    return {
      kind: 'unknown',
      title: 'Something went wrong',
      message: 'Please try again in a moment.',
      canRetry: true,
    };
  }
  switch (error.kind) {
    case 'rate_limited': {
      const when = waitPhrase(error.retryAfterSeconds) ?? 'in a moment';
      return {
        kind: 'busy',
        title: 'Too many requests at once',
        message: `Give it a breather and try again ${when}.`,
        canRetry: true,
      };
    }
    case 'network':
      return {
        kind: 'offline',
        title: "You're offline",
        message: `${feature} needs a connection. Check yours and try again.`,
        canRetry: true,
      };
    case 'timeout':
      return {
        kind: 'slow',
        title: 'That took too long',
        message: `${feature} didn't answer in time. Try again.`,
        canRetry: true,
      };
    case 'unauthorized':
      return {
        kind: 'signed_out',
        title: 'Your session has expired',
        message: 'Sign in again to keep going.',
        canRetry: false,
      };
    case 'validation':
    case 'forbidden':
      return {
        kind: 'rejected',
        title: "That couldn't be sent",
        message: error.serverMessage ?? 'Try a shorter message or a different photo.',
        canRetry: false,
      };
    default:
      return {
        kind: 'unknown',
        title: 'Something went wrong',
        message: error.userMessage,
        canRetry: error.retryable,
      };
  }
}

/** A gentle heads-up once few requests remain today; null while plenty are left. */
export function remainingNote(remaining: number | null, copy: ProblemCopy = CHEF_COPY) {
  if (remaining == null || remaining > 5) return null;
  if (remaining === 0) return `That was your last ${copy.feature} request for today.`;
  return `${remaining} ${copy.feature} request${remaining === 1 ? '' : 's'} left today.`;
}
