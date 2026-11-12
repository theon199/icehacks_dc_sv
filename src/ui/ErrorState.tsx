import type { StyleProp, ViewStyle } from 'react-native';

import { isApiError } from '@/lib/api/errors';

import { EmptyState } from './EmptyState';

export interface ErrorStateProps {
  /** The caught error; API errors contribute their user-facing message. */
  error?: unknown;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const FALLBACK_MESSAGE = 'Please try again in a moment.';

/** Picks the most helpful copy for an error without leaking internals. */
export function errorMessageFor(error: unknown, override?: string): string {
  if (override) return override;
  if (isApiError(error)) return error.userMessage;
  return FALLBACK_MESSAGE;
}

/** Inline failure state with an optional retry action. */
export function ErrorState({
  error,
  title = "Something didn't load",
  message,
  onRetry,
  retryLabel = 'Try again',
  style,
}: ErrorStateProps) {
  const offline = isApiError(error) && error.kind === 'network';
  return (
    <EmptyState
      tone="danger"
      icon={offline ? 'wifi.slash' : 'exclamationmark.triangle'}
      title={offline ? "You're offline" : title}
      message={errorMessageFor(error, message)}
      {...(onRetry ? { actionLabel: retryLabel, onAction: onRetry } : {})}
      {...(style ? { style } : {})}
    />
  );
}
