/**
 * Sending questions to Chef and storing the answers in the (synced) chef store.
 *
 * The person's message is saved first, so it survives a failed request; "Try again" then asks
 * again for the same thread. Recipe ids in a reply are re-screened against the person's current
 * preferences before they are stored, and again whenever a message is displayed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@/lib/logger';
import { selectThread, useChefStore, usePreferencesStore, type ChefMessage } from '@/stores';

import { aiApi, listCandidates, safetyPrefsFrom, searchRecipes } from '../deps';
import { withPhotoMark } from '../logic/conversation';
import { describeAiProblem, remainingNote, type AiProblem } from '../logic/problems';
import { buildChefRequest, type CatalogAccess } from '../logic/request';
import { finderFor, screenSuggestedIds } from '../logic/screening';

const catalog: CatalogAccess = { listCandidates, searchRecipes };

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
  send(input: SendInput): void;
  /** Asks again for the person's last unanswered message. */
  retry(): void;
  dismissProblem(): void;
}

interface Attempt {
  readonly threadId: string;
  readonly photo: string | null;
}

interface Failure {
  readonly threadId: string;
  readonly problem: AiProblem;
  readonly photo: string | null;
}

export function useChefConversation(
  threadId: string | null,
  onThreadStarted: (threadId: string) => void,
): ChefConversation {
  const thread = useChefStore(selectThread(threadId ?? ''));
  const messages = thread?.messages ?? NO_MESSAGES;
  const [sendingIn, setSendingIn] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [followUps, setFollowUps] = useState<Readonly<Record<string, readonly string[]>>>({});
  const [quotaNote, setQuotaNote] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const ask = useCallback(async (attempt: Attempt) => {
    const controller = new AbortController();
    inFlight.current = controller;
    setSendingIn(attempt.threadId);
    setFailure(null);
    try {
      const prefs = usePreferencesStore.getState().prefs;
      const current = useChefStore.getState().threads[attempt.threadId]?.messages ?? [];
      const built = await buildChefRequest(current, prefs, catalog, attempt.photo ?? undefined);
      if (!built || controller.signal.aborted) return;
      const reply = await aiApi.askChef(built.request, { signal: controller.signal });
      // Preferences may have changed while Chef was thinking; screen against the latest ones.
      const latest = safetyPrefsFrom(usePreferencesStore.getState().prefs);
      const { safe, dropped } = screenSuggestedIds(
        reply.recipe_ids,
        finderFor(built.offered),
        latest,
      );
      if (dropped.length > 0) {
        logger.info('Chef: dropped recipes that did not pass the safety check', {
          count: dropped.length,
        });
      }
      useChefStore.getState().append(attempt.threadId, {
        role: 'assistant',
        text: reply.reply,
        recipeIds: safe.map((recipe) => recipe.id),
      });
      setFollowUps((all) => ({ ...all, [attempt.threadId]: reply.follow_ups }));
      setQuotaNote(remainingNote(reply.quota.remaining));
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailure({
        threadId: attempt.threadId,
        problem: describeAiProblem(error),
        photo: attempt.photo,
      });
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setSendingIn(null);
      }
    }
  }, []);

  const send = useCallback(
    ({ text, photo }: SendInput) => {
      const trimmed = text.trim();
      if ((!trimmed && !photo) || inFlight.current) return;
      const body = photo ? withPhotoMark(trimmed) : trimmed;
      const store = useChefStore.getState();
      let id = threadId && store.threads[threadId] ? threadId : null;
      if (!id) {
        id = store.startThread(body);
        onThreadStarted(id);
      }
      store.append(id, { role: 'user', text: body });
      const started = id;
      setFollowUps((all) => ({ ...all, [started]: NO_FOLLOW_UPS }));
      void ask({ threadId: started, photo: photo ?? null });
    },
    [ask, onThreadStarted, threadId],
  );

  const retry = useCallback(() => {
    if (!threadId || inFlight.current) return;
    // The photo only travels again with a retry of the attempt it belonged to.
    const photo = failure?.threadId === threadId ? failure.photo : null;
    void ask({ threadId, photo });
  }, [ask, failure, threadId]);

  const dismissProblem = useCallback(() => setFailure(null), []);

  return {
    messages,
    sending: sendingIn != null && sendingIn === threadId,
    busy: sendingIn != null,
    problem: failure && failure.threadId === threadId ? failure.problem : null,
    followUps: (threadId && followUps[threadId]) || NO_FOLLOW_UPS,
    quotaNote,
    send,
    retry,
    dismissProblem,
  };
}
