/**
 * Whether the chat thread is resting at its newest message, from where its scroll view stands.
 * The list follows new messages by itself, but not a shrinking viewport (the keyboard) or a growing
 * footer (the "Thinking" card, an error card), so the screen asks this before those changes land.
 */

/** Where the thread's scroll view stands, in points. */
export interface ThreadMetrics {
  /** How far the content is scrolled from its top. */
  readonly offset: number;
  /** Height of everything in the list, footer included. */
  readonly content: number;
  /** Height of the visible part of the list. */
  readonly viewport: number;
}

/**
 * Share of the viewport the reader may sit above the end and still count as reading the newest
 * message. The same share the list uses to decide whether to follow new messages.
 */
export const NEAR_END_SHARE = 0.2;

/**
 * True when the reader is at, or within `NEAR_END_SHARE` of a viewport above, the end of the
 * thread. A list that has not been measured yet, or whose content fits on screen, counts as at the
 * end.
 */
export function isNearEnd(metrics: ThreadMetrics, share: number = NEAR_END_SHARE): boolean {
  const { offset, content, viewport } = metrics;
  if (viewport <= 0) return true;
  const belowView = content - (offset + viewport);
  return belowView <= viewport * share;
}
