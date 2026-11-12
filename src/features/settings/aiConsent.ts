/**
 * Records the person's answer about AI features. The answer is stored on the account (Supabase
 * Auth user metadata) so it follows them to other devices, and in the session store, which opens
 * or closes the AI routes immediately.
 *
 * Withdrawing takes effect on this device even if the server cannot be reached; agreeing needs the
 * server to confirm first, so the record of consent always exists before AI is used. A withdrawal
 * the server has not acknowledged yet is kept on the device and sent again by
 * `reconcileAiConsent`, which also brings a choice made on another device to this one.
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

async function writeServerRecord(record: AiConsentRecord): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ data: { ai_consent: record } });
  if (error) throw error;
}

/** Bumped on every decision, so a reconcile that started earlier never overrides a newer answer. */
let decisionCount = 0;

/**
 * Saves the answer. Throws when agreeing could not be saved; a withdrawal never throws. If the
 * server could not record a withdrawal, it is kept on the device and retried later.
 */
export async function setAiConsent(granted: boolean, now: Date = new Date()): Promise<void> {
  const userId = useSessionStore.getState().userId;
  if (!userId) return;
  decisionCount += 1;
  const record = aiConsentRecord(granted, now);

  if (granted) {
    await writeServerRecord(record);
    rememberUnsent(userId, null);
    useSessionStore.getState().setAiConsent(true);
    return;
  }

  useSessionStore.getState().setAiConsent(false);
  rememberUnsent(userId, record);
  try {
    await writeServerRecord(record);
    rememberUnsent(userId, null);
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
      await writeServerRecord(unsent);
      if (stillCurrent()) rememberUnsent(userId, null);
      return;
    }

    const { data, error } = await getSupabase().auth.getUser();
    if (error || data.user?.id !== userId || !stillCurrent()) return;
    const record = readConsentRecord(data.user.user_metadata);
    if (!record) return;
    const granted = recordGrantsAi(record);
    if (useSessionStore.getState().aiConsent !== granted) {
      useSessionStore.getState().setAiConsent(granted);
    }
  } catch (error) {
    logger.warn('Could not reconcile AI consent with the account', describeError(error));
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
}
