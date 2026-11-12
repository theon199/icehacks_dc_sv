/**
 * What to tell the person when a snap fails, and what they can do about it.
 */
import { isAiAgeRestricted, isAiQuotaExceeded, isAiRefused } from '@/lib/api/ai';
import { isApiError } from '@/lib/api/errors';

/** The photo could not be read or converted on the device. */
export class PhotoPrepError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PhotoPrepError';
  }
}

export interface SnapProblem {
  title: string;
  message: string;
  /** Whether trying the same photo again could work. */
  canRetry: boolean;
  /** Whether a different photo could work. */
  canRetake: boolean;
  /**
   * Set when no snap can work for a while (the daily limit): how many seconds to keep the shutter
   * off, and what to say meanwhile.
   */
  pause?: { seconds: number; note: string };
}

/** Seconds from `now` until the next local midnight, when an unknown daily limit is assumed to reset. */
export function secondsUntilMidnight(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(60, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
}

function waitPhrase(seconds: number | undefined): string {
  if (seconds == null || seconds <= 0) return 'tomorrow';
  const hours = Math.round(seconds / 3600);
  if (hours >= 2) return `in about ${hours} hours`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60
    ? 'in about an hour'
    : `in about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** Null for a cancellation the person asked for, which needs no message. */
export function describeSnapError(error: unknown, now: Date = new Date()): SnapProblem | null {
  if (error instanceof PhotoPrepError) {
    return {
      title: "Couldn't use that photo",
      message: 'Famara could not read this image. Try taking the photo again or pick another one.',
      canRetry: false,
      canRetake: true,
    };
  }
  if (!isApiError(error)) {
    return {
      title: 'Something went wrong',
      message: 'Please try again in a moment.',
      canRetry: true,
      canRetake: true,
    };
  }
  if (error.kind === 'cancelled') return null;
  // The AI helpers are type guards; checking through `unknown` keeps `error` an ApiError below.
  const raw: unknown = error;
  if (isAiQuotaExceeded(raw)) {
    const wait = waitPhrase(error.retryAfterSeconds);
    const seconds =
      error.retryAfterSeconds != null && error.retryAfterSeconds > 0
        ? error.retryAfterSeconds
        : secondsUntilMidnight(now);
    return {
      title: "You've used today's snaps",
      message: `Snap has a daily limit. You can snap again ${wait}.`,
      canRetry: false,
      canRetake: false,
      pause: { seconds, note: `Daily limit reached. You can snap again ${wait}.` },
    };
  }
  if (isAiAgeRestricted(raw)) {
    return {
      title: 'Snap is for adults',
      message: 'AI features are available to people 18 and over.',
      canRetry: false,
      canRetake: false,
    };
  }
  if (isAiRefused(raw)) {
    return {
      title: "Couldn't read that photo",
      message:
        'The AI could not work with this photo. A clearer, closer shot of the food may help.',
      canRetry: true,
      canRetake: true,
    };
  }
  if (error.kind === 'validation') {
    return {
      title: "Couldn't use that photo",
      message: 'The photo may be too large or in a format Famara cannot read. Try another one.',
      canRetry: false,
      canRetake: true,
    };
  }
  return {
    title: error.kind === 'network' ? "You're offline" : "Couldn't read your photo",
    message: error.userMessage,
    canRetry: error.retryable,
    canRetake: true,
  };
}
