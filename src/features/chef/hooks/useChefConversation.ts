/**
 * One Chef thread as the screen sees it: its messages from the (synced) chef store plus what is
 * happening right now from the Chef session (see `chefSession.ts`).
 *
 * The person's message is saved first, so it survives a failed request; "Try again" then asks
 * again for the same thread. Recipe ids in a reply are re-screened against the person's current
 * preferences before they are stored, and again whenever a message is displayed. A question keeps
 * running when the screen goes away, and its answer lands in the thread.
 */
import { useCallback, useEffect } from 'react';

import { selectThread, useChefStore, type ChefMessage } from '@/stores';

import {
  askChef,
  clearFollowUps,
  dismissChefProblem,
  expireLimit,
  isChefBusy,
  useChefSession,
} from './chefSession';
import { withPhotoMark } from '../logic/conversation';
import type { AiProblem } from '../logic/problems';

const NO_MESSAGES: readonly ChefMessage[] = [];
const NO_FOLLOW_UPS: readonly string[] = [];

export interface SendInput {
  readonly text: string;
  /** Base64 JPEG of an attached photo. */
  readonly photo?: string | null;
}

export interface ChefConversation {
  readonly messages: readonly ChefMessage[];
  /** Chef is answering in this thread. */
  readonly sending: boolean;
  /** Chef is answering in some thread; one question at a time. */
  readonly busy: boolean;
  readonly problem: AiProblem | null;
  /** Suggested next questions from the latest reply in this thread. */
  readonly followUps: readonly string[];
  /** A heads-up when few requests remain today. */
  readonly quotaNote: string | null;
  /** Today's allowance is spent, so asking again cannot work yet. */
  readonly limited: boolean;
  send(input: SendInput): void;
  /** Asks again for the person's last unanswered message. */
  retry(): void;
  dismissProblem(): void;
}

export function useChefConversation(
  threadId: string | null,
  onThreadStarted: (threadId: string) => void,
): ChefConversation {
  const key = threadId ?? '';
  const thread = useChefStore(selectThread(key));
  const messages = thread?.messages ?? NO_MESSAGES;
  const sendingIn = useChefSession((state) => state.sendingIn);
  const failure = useChefSession((state) => (threadId ? state.failures[threadId] : undefined));
  const followUps = useChefSession((state) => (threadId ? state.followUps[threadId] : undefined));
  const quotaNote = useChefSession((state) => state.quotaNote);
  const limitedUntil = useChefSession((state) => state.limitedUntil);

  useEffect(() => {
    if (limitedUntil == null) return;
    const wait = limitedUntil - Date.now();
    if (wait <= 0) {
      expireLimit(limitedUntil);
      return;
    }
    // Browsers and Hermes cap timers at about 24.8 days; a daily allowance never gets near it.
    const timer = setTimeout(() => expireLimit(limitedUntil), Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [limitedUntil]);

  const send = useCallback(
    ({ text, photo }: SendInput) => {
      const trimmed = text.trim();
      if ((!trimmed && !photo) || isChefBusy()) return;
      const body = photo ? withPhotoMark(trimmed) : trimmed;
      const store = useChefStore.getState();
      let id = threadId && store.threads[threadId] ? threadId : null;
      if (!id) {
        id = store.startThread(body);
        onThreadStarted(id);
      }
      store.append(id, { role: 'user', text: body });
      clearFollowUps(id);
      void askChef({ threadId: id, photo: photo ?? null });
    },
    [onThreadStarted, threadId],
  );

  const retry = useCallback(() => {
    if (!threadId || isChefBusy()) return;
    // The photo only travels again with a retry of the attempt it belonged to.
    const photo = useChefSession.getState().failures[threadId]?.photo ?? null;
    void askChef({ threadId, photo });
  }, [threadId]);

  const dismissProblem = useCallback(() => {
    if (threadId) dismissChefProblem(threadId);
  }, [threadId]);

  return {
    messages,
    sending: sendingIn != null && sendingIn === threadId,
    busy: sendingIn != null,
    problem: failure?.problem ?? null,
    followUps: followUps ?? NO_FOLLOW_UPS,
    quotaNote,
    limited: limitedUntil != null,
    send,
    retry,
    dismissProblem,
  };
}
