/**
 * Turns a stored thread into the message list the `chef` function accepts: non-empty turns of at
 * most 4000 characters, at most 40 of them, starting and ending with the person.
 */
import type { ChefThreadMessage } from '@/lib/api/ai';
import type { ChefMessage } from '@/stores';

export const MAX_REQUEST_MESSAGES = 40;
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * Prefix stored on a message that was sent with a photo. Photos are not kept on the device, so
 * the marker is what lets later turns (and the thread view) know one was shared.
 */
export const PHOTO_MARK = '[Photo] ';
/** Question used when someone sends a photo without typing anything. */
export const PHOTO_ONLY_PROMPT = 'What could I cook with this?';

export function withPhotoMark(text: string): string {
  return `${PHOTO_MARK}${text.trim() || PHOTO_ONLY_PROMPT}`;
}

/** Splits a stored message into its text and whether a photo was attached. */
export function readPhotoMark(text: string): { text: string; hasPhoto: boolean } {
  return text.startsWith(PHOTO_MARK)
    ? { text: text.slice(PHOTO_MARK.length), hasPhoto: true }
    : { text, hasPhoto: false };
}

/**
 * The request messages for a thread, or null when there is nothing to answer (empty thread, or
 * the last turn is not the person's).
 */
export function toRequestMessages(messages: readonly ChefMessage[]): ChefThreadMessage[] | null {
  const turns: ChefThreadMessage[] = [];
  for (const message of messages) {
    const content = message.text.trim().slice(0, MAX_MESSAGE_LENGTH).trim();
    if (content) turns.push({ role: message.role, content });
  }
  if (turns[turns.length - 1]?.role !== 'user') return null;
  let recent = turns.slice(-MAX_REQUEST_MESSAGES);
  const firstUser = recent.findIndex((turn) => turn.role === 'user');
  recent = recent.slice(firstUser);
  return recent;
}

/** True when the person's last message has no answer yet. */
export function awaitsReply(messages: readonly ChefMessage[]): boolean {
  return messages[messages.length - 1]?.role === 'user';
}
