/**
 * Speaks a status change to screen readers on both platforms. Live regions only exist on Android,
 * so content that appears in place (a thank-you, freshly loaded tips) is announced explicitly.
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Announces `message` whenever it changes to a new non-null value. What is already showing when
 * the component mounts, or when `scope` changes (another place opened in the same sheet), is not
 * announced: the person did not just cause it.
 */
export function useAnnouncement(message: string | null, scope?: string): void {
  const last = useRef({ message, scope });
  useEffect(() => {
    const previous = last.current;
    last.current = { message, scope };
    if (previous.scope !== scope) return;
    if (message !== null && message !== previous.message) {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message, scope]);
}
