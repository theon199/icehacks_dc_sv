/**
 * What Chef is doing right now, kept outside any screen so it survives leaving the Search tab:
 * the question in flight, the last problem in each thread, the suggested follow-ups of each
 * thread and the account's remaining allowance for today. Nothing here is persisted; answers
 * themselves go straight into the (synced) chef store.
 *
 * A question that has been sent always runs to the end, even if the Chef screen goes away: the
 * server has already counted it, so its answer is kept rather than thrown away.
 */
import { create } from 'zustand';

import { logger } from '@/lib/logger';
import { useChefStore, usePreferencesStore } from '@/stores';

import {
  aiApi,
  isAiQuotaExceeded,
  listCandidates,
  safetyPrefsFrom,
  searchRecipes,
  useSessionStore,
} from '../deps';
import { describeAiProblem, remainingNote, type AiProblem } from '../logic/problems';
import { buildChefRequest, type CatalogAccess } from '../logic/request';
import { finderFor, screenSuggestedIds } from '../logic/screening';

const catalog: CatalogAccess = { listCandidates, searchRecipes };

/** How long to hold back "Ask again" after a spent allowance when the server gives no time. */
const DEFAULT_LIMIT_SECONDS = 60 * 60;

export interface ChefFailure {
  readonly problem: AiProblem;
  /** Base64 JPEG of the photo that went with the failed question, sent again on "Try again". */
  readonly photo: string | null;
}

export interface ChefAttempt {
  readonly threadId: string;
  readonly photo: string | null;
}

interface ChefSessionState {
  /** Thread whose question is in flight; one question at a time across all threads. */
  sendingIn: string | null;
  failures: Readonly<Record<string, ChefFailure>>;
  followUps: Readonly<Record<string, readonly string[]>>;
  /** Heads-up about today's allowance. It is per account, so every thread shows it. */
  quotaNote: string | null;
  /** Until when (epoch ms) the daily allowance is known to be spent. */
  limitedUntil: number | null;
}

const INITIAL: ChefSessionState = {
  sendingIn: null,
  failures: {},
  followUps: {},
  quotaNote: null,
  limitedUntil: null,
};

export const useChefSession = create<ChefSessionState>()(() => INITIAL);

const omit = <T>(record: Readonly<Record<string, T>>, key: string) => {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
};

/** Forgets everything about the current conversation state (on sign-out, and in tests). */
export function resetChefSession(): void {
  useChefSession.setState(INITIAL, true);
}

export function isChefBusy(): boolean {
  return useChefSession.getState().sendingIn != null;
}

export function dismissChefProblem(threadId: string): void {
  useChefSession.setState((state) => ({ failures: omit(state.failures, threadId) }));
}

/** Clears a thread's suggestions once the person asks something new in it. */
export function clearFollowUps(threadId: string): void {
  useChefSession.setState((state) => ({ followUps: omit(state.followUps, threadId) }));
}

/**
 * Asks Chef about the thread's latest message and stores the answer. Returns without asking when
 * another question is still in flight.
 */
export async function askChef(attempt: ChefAttempt): Promise<void> {
  if (isChefBusy()) return;
  const { threadId } = attempt;
  useChefSession.setState((state) => ({
    sendingIn: threadId,
    failures: omit(state.failures, threadId),
  }));
  try {
    const prefs = usePreferencesStore.getState().prefs;
    const current = useChefStore.getState().threads[threadId]?.messages ?? [];
    const built = await buildChefRequest(current, prefs, catalog, attempt.photo ?? undefined);
    if (!built) return;
    const reply = await aiApi.askChef(built.request);
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
    // A thread deleted (or an account signed out) meanwhile simply ignores the answer.
    useChefStore.getState().append(threadId, {
      role: 'assistant',
      text: reply.reply,
      recipeIds: safe.map((recipe) => recipe.id),
    });
    useChefSession.setState((state) => ({
      followUps: { ...state.followUps, [threadId]: reply.follow_ups },
      quotaNote: remainingNote(reply.quota.remaining),
      limitedUntil: reply.quota.remaining === 0 ? limitEnd(reply.quota.reset_at) : null,
    }));
  } catch (error) {
    const problem = describeAiProblem(error);
    const spent = isAiQuotaExceeded(error);
    useChefSession.setState((state) => ({
      failures: { ...state.failures, [threadId]: { problem, photo: attempt.photo } },
      ...(spent
        ? {
            // Stays visible after the problem card is dismissed, in every thread.
            quotaNote: `${problem.title}.`,
            limitedUntil: Date.now() + (error.retryAfterSeconds ?? DEFAULT_LIMIT_SECONDS) * 1000,
          }
        : {}),
    }));
  } finally {
    useChefSession.setState({ sendingIn: null });
  }
}

function limitEnd(resetAt: string | null | undefined): number {
  const at = resetAt ? Date.parse(resetAt) : Number.NaN;
  return Number.isFinite(at) ? at : Date.now() + DEFAULT_LIMIT_SECONDS * 1000;
}

// Another account must not see this one's suggestions or allowance.
useSessionStore.subscribe((state, previous) => {
  if (state.userId !== previous.userId) resetChefSession();
});
