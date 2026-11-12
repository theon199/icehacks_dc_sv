/**
 * Records the person's answer about AI features. The answer is stored on the account (Supabase
 * Auth user metadata) so it follows them to other devices, and in the session store, which opens
 * or closes the AI routes immediately.
 *
 * Withdrawing takes effect on this device even if the server cannot be reached; agreeing needs the
 * server to confirm first, so the record of consent always exists before AI is used. A withdrawal
 * the server has not acknowledged yet is kept on the device and sent again by
 * `reconcileAiConsent`, which also brings a choice made on another device to this one. A write
 * that timed out but settles later is followed by the answer this device holds, so a stale answer
 * never stays on the account while the device shows another. An agreement is only sent again when
 * the account holds nothing newer, so a withdrawal made on another device is never undone.
 */
import { useEffect } from 'react';
import { z } from 'zod';

import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';
import { defineKvKey } from '@/lib/storage/kv';
import { getSupabase } from '@/lib/supabase/client';

/** Version of the AI explanation the person agreed to; bump when its substance changes. */
export const AI_TERMS_VERSION = 1;

const consentRecordSchema = z.object({
  granted: z.boolean(),
  terms_version: z.number().int().min(0),
  decided_at: z.string(),
});

export type AiConsentRecord = z.infer<typeof consentRecordSchema>;

export function aiConsentRecord(granted: boolean, now: Date): AiConsentRecord {
  return { granted, terms_version: AI_TERMS_VERSION, decided_at: now.toISOString() };
}

/** Whether a stored record opens AI features: a yes to the current explanation, nothing less. */
export function recordGrantsAi(record: AiConsentRecord): boolean {
  return record.granted && record.terms_version >= AI_TERMS_VERSION;
}

/** Reads the consent record from user metadata; anything malformed counts as no record. */
export function readConsentRecord(metadata: unknown): AiConsentRecord | null {
  if (typeof metadata !== 'object' || metadata == null) return null;
  const parsed = consentRecordSchema.safeParse((metadata as Record<string, unknown>).ai_consent);
  return parsed.success ? parsed.data : null;
}

const unsentWithdrawal = (userId: string) =>
  defineKvKey(`settings.ai-consent.unsent.${userId}`, consentRecordSchema);

function readUnsent(userId: string): AiConsentRecord | null {
  try {
    return unsentWithdrawal(userId).getSync();
  } catch {
    return null;
  }
}

function rememberUnsent(userId: string, record: AiConsentRecord | null): void {
  try {
    const key = unsentWithdrawal(userId);
    if (record) key.setSync(record);
    else void key.remove();
  } catch (error) {
    logger.warn('Could not update the unsent AI withdrawal', describeError(error));
  }
}

/** How long one account write may take before the queue moves on and treats it as failed. */
export const AI_CONSENT_WRITE_TIMEOUT_MS = 15_000;

/**
 * Writes that timed out but have not settled yet. Such a write may still reach the server after a
 * newer one, so while any are outstanding a withdrawal is kept on the device for resending.
 */
let outstandingLateWrites = 0;

/**
 * Bumped when the module state is reset. A late write only touches the counter above when it was
 * counted in the current generation, so a write from before a reset cannot drive it below zero.
 */
let lateWriteGeneration = 0;

/**
 * How many timed-out writes have settled while their account was signed in. An agreement notes
 * this before it is sent; if it changed by the time the server confirms, a stale write may have
 * landed after the agreement, so the account is checked once the agreement is confirmed.
 */
let lateSettles = 0;

/**
 * The answer this device currently follows for one account: a withdrawal as soon as it is made,
 * an agreement once the server has confirmed it, or the account's record when it was adopted from
 * there. A late write that settles after it is answered by sending this again. `seq` is the
 * decision count it belongs to; once another answer has been started it is no longer the latest,
 * even before that answer is confirmed.
 */
interface LatestDecision {
  readonly userId: string;
  readonly record: AiConsentRecord;
  readonly seq: number;
}

let latestDecision: LatestDecision | null = null;

/** Bumped on every decision, so work that started earlier never overrides a newer answer. */
let decisionCount = 0;

async function writeServerRecord(record: AiConsentRecord): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ data: { ai_consent: record } });
  if (error) throw error;
}

/**
 * Sends `record`, giving up after the timeout so one stuck request cannot hold every later answer.
 * When a write that gave up finally settles while the same account is signed in, the account is
 * brought back in line with this device (`afterLateWrite`), since the late write may have replaced
 * a newer answer on the server.
 */
function writeServerRecordWithTimeout(userId: string, record: AiConsentRecord): Promise<void> {
  const write = writeServerRecord(record);
  const generation = lateWriteGeneration;
  return new Promise<void>((resolve, reject) => {
    let timedOut = false;
    let counted = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (generation === lateWriteGeneration) {
        outstandingLateWrites += 1;
        counted = true;
      }
      reject(new Error('The account write timed out'));
    }, AI_CONSENT_WRITE_TIMEOUT_MS);
    write.then(
      () => {
        if (!timedOut) {
          clearTimeout(timer);
          resolve();
        }
      },
      (error: unknown) => {
        if (!timedOut) {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      },
    );
    void write
      .catch(() => undefined)
      .then(() => {
        // A write from before a reset belongs to state that no longer exists.
        if (!counted || generation !== lateWriteGeneration) return;
        outstandingLateWrites -= 1;
        afterLateWrite(userId);
      });
  });
}

/**
 * A timed-out write for `userId` has just settled, whether it reached the server or failed, and
 * may have overwritten a newer answer: a failed request can still have been applied when only the
 * response was lost. While that account is still signed in, the answer this device follows is
 * sent again; with none known (after a restart, say) the usual reconcile runs, which resends an
 * unsent withdrawal or adopts the account record. When a newer agreement is still on its way, the
 * check is deferred to it: the stale write may be applied before or after that agreement, so
 * `setAiConsent` checks the account once the agreement is confirmed (see `lateSettles`). A yes that
 * failed hands the check back to the answer the device kept following.
 */
function afterLateWrite(userId: string): void {
  if (useSessionStore.getState().userId !== userId) return;
  lateSettles += 1;
  const latest = latestDecision;
  if (latest?.userId !== userId) {
    void reconcileAiConsent();
    return;
  }
  if (isLatest(latest)) void resendDecision(latest);
}

/** Whether `decision` is still the answer this device follows, with no newer one started. */
function isLatest(decision: LatestDecision): boolean {
  return (
    latestDecision === decision &&
    decisionCount === decision.seq &&
    useSessionStore.getState().userId === decision.userId
  );
}

/** Whether `a` was decided after `b`; an unreadable time never counts as newer. */
function decidedAfter(a: AiConsentRecord, b: AiConsentRecord): boolean {
  const at = Date.parse(a.decided_at);
  const bt = Date.parse(b.decided_at);
  return Number.isFinite(at) && Number.isFinite(bt) && at > bt;
}

function sameRecord(a: AiConsentRecord, b: AiConsentRecord): boolean {
  return (
    a.granted === b.granted && a.terms_version === b.terms_version && a.decided_at === b.decided_at
  );
}

/**
 * Before an agreement is sent again, the account is read. If it already holds that agreement
 * (the late write failed and changed nothing) nothing needs sending. If it holds a newer answer,
 * made on another device after this one agreed, this device follows that answer instead. Only an
 * older record, or none, is replaced. Resolves false when the account cannot be read, so consent
 * is never sent again on a guess; the next reconcile settles it.
 */
async function grantNeedsResend(decision: LatestDecision): Promise<boolean> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || data.user?.id !== decision.userId || !isLatest(decision)) return false;
  const current = readConsentRecord(data.user.user_metadata);
  if (!current) return true;
  if (sameRecord(current, decision.record)) return false;
  if (decidedAfter(current, decision.record)) {
    latestDecision = { userId: decision.userId, record: current, seq: decision.seq };
    const granted = recordGrantsAi(current);
    if (useSessionStore.getState().aiConsent !== granted) {
      useSessionStore.getState().setAiConsent(granted);
    }
    return false;
  }
  return true;
}

/**
 * Sends `decision` again unless a newer one replaces it before its turn in the queue. A
 * withdrawal is always sent again, like an unsent one; an agreement only after `grantNeedsResend`.
 */
async function resendDecision(decision: LatestDecision): Promise<void> {
  const { userId, record } = decision;
  const stillLatest = () => isLatest(decision);
  try {
    if (record.granted && !(await grantNeedsResend(decision))) return;
    const sent = await sendRecord(userId, record, stillLatest);
    if (sent && !record.granted && stillLatest() && noLateWrites()) rememberUnsent(userId, null);
  } catch (error) {
    logger.warn('Could not resend the AI answer after a late account write', describeError(error));
  }
}

/** Whether a sent withdrawal can be forgotten: no earlier write can still land after it. */
const noLateWrites = () => outstandingLateWrites === 0;

/**
 * Server writes run one at a time, in the order they were asked for. Without this a reconcile
 * resending an old withdrawal could land after a newer "yes", leaving the account saying no while
 * this device says yes.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Queues `record` for `userId`'s account. When its turn comes it is sent only if that account is
 * still signed in (the write goes to whoever holds the session) and `stillWanted()` holds.
 * Resolves true once sent, false when skipped; rejects when the server refused it or did not
 * answer within `AI_CONSENT_WRITE_TIMEOUT_MS`.
 */
function sendRecord(
  userId: string,
  record: AiConsentRecord,
  stillWanted: () => boolean = () => true,
): Promise<boolean> {
  const turn = writeQueue.then(async () => {
    if (useSessionStore.getState().userId !== userId || !stillWanted()) return false;
    await writeServerRecordWithTimeout(userId, record);
    return true;
  });
  writeQueue = turn.catch(() => undefined);
  return turn;
}

/**
 * Saves the answer. Throws when agreeing could not be saved; a withdrawal never throws. If the
 * server could not record a withdrawal, it is kept on the device and retried later.
 */
export async function setAiConsent(granted: boolean, now: Date = new Date()): Promise<void> {
  const userId = useSessionStore.getState().userId;
  if (!userId) return;
  decisionCount += 1;
  const decision = decisionCount;
  const record = aiConsentRecord(granted, now);
  // Whether this is still the person's latest answer on the same account.
  const latest = () => decisionCount === decision && useSessionStore.getState().userId === userId;

  if (granted) {
    const settlesBefore = lateSettles;
    let sent: boolean;
    try {
      sent = await sendRecord(userId, record);
    } catch (error) {
      // The yes was not confirmed, so the device keeps following its previous answer. Mark that
      // answer as current again: if the timed-out yes still lands on the server later, the late
      // write is then followed by resending the previous answer, so account and device agree.
      if (latest() && latestDecision?.userId === userId) {
        latestDecision = { ...latestDecision, seq: decision };
        // A previous withdrawal is also kept on the device until it is confirmed again, so a
        // later reconcile resends it instead of adopting a yes the person was told had failed.
        if (!latestDecision.record.granted) rememberUnsent(userId, latestDecision.record);
      }
      throw error;
    }
    if (!sent) throw new Error('The account changed before saving');
    // A newer answer given meanwhile owns the device state, including its unsent withdrawal.
    if (!latest()) return;
    const confirmed: LatestDecision = { userId, record, seq: decision };
    latestDecision = confirmed;
    rememberUnsent(userId, null);
    useSessionStore.getState().setAiConsent(true);
    // A stale write settled while this agreement was on its way and may have reached the server
    // after it. The account is read first, so nothing is sent when it already holds this answer.
    if (lateSettles !== settlesBefore) void resendDecision(confirmed);
    return;
  }

  latestDecision = { userId, record, seq: decision };
  useSessionStore.getState().setAiConsent(false);
  rememberUnsent(userId, record);
  try {
    if ((await sendRecord(userId, record)) && latest() && noLateWrites()) {
      rememberUnsent(userId, null);
    }
  } catch (error) {
    logger.warn('AI withdrawal not saved to the account yet; will retry', describeError(error));
  }
}

/**
 * Brings this device and the account record into line:
 * - an unsent withdrawal from this device is sent first, and AI stays off meanwhile;
 * - otherwise the account record wins, so a withdrawal made on another device closes AI here, and
 *   an agreement made elsewhere opens it (for the current explanation version only).
 * Never throws; with no connection it leaves things as they are.
 */
export async function reconcileAiConsent(): Promise<void> {
  const userId = useSessionStore.getState().userId;
  if (!userId) return;
  const startedAt = decisionCount;
  const stillCurrent = () =>
    decisionCount === startedAt && useSessionStore.getState().userId === userId;

  try {
    const unsent = readUnsent(userId);
    if (unsent) {
      if (useSessionStore.getState().aiConsent) useSessionStore.getState().setAiConsent(false);
      // Checked again when its turn in the queue comes: a newer answer replaces this resend.
      const sent = await sendRecord(userId, unsent, stillCurrent);
      if (sent && stillCurrent() && noLateWrites()) rememberUnsent(userId, null);
      return;
    }

    const { data, error } = await getSupabase().auth.getUser();
    if (error || data.user?.id !== userId || !stillCurrent()) return;
    const record = readConsentRecord(data.user.user_metadata);
    if (!record) return;
    // The account's record is what this device follows from now on, including after late writes.
    latestDecision = { userId, record, seq: startedAt };
    const granted = recordGrantsAi(record);
    if (useSessionStore.getState().aiConsent !== granted) {
      useSessionStore.getState().setAiConsent(granted);
    }
  } catch (error) {
    logger.warn('Could not reconcile AI consent with the account', describeError(error));
  }
}

/**
 * Removes what this device keeps about one account's AI answer. Used when that account is
 * deleted: its unsent withdrawal has no account left to reach.
 */
export async function forgetAiConsentOnDevice(userId: string): Promise<void> {
  if (latestDecision?.userId === userId) latestDecision = null;
  try {
    await unsentWithdrawal(userId).remove();
  } catch (error) {
    logger.warn('Could not remove the unsent AI withdrawal', describeError(error));
  }
}

/** Reconciles AI consent whenever the signed-in account changes while the caller is mounted. */
export function useAiConsentSync(): void {
  const userId = useSessionStore((s) => s.userId);
  useEffect(() => {
    if (userId) void reconcileAiConsent();
  }, [userId]);
}

/** Test hook. */
export function resetAiConsentForTests(): void {
  decisionCount = 0;
  lateSettles = 0;
  lateWriteGeneration += 1;
  outstandingLateWrites = 0;
  latestDecision = null;
  writeQueue = Promise.resolve();
}
