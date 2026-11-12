/**
 * Records the person's answer about AI features. The answer is stored on the account (Supabase
 * Auth user metadata) so it follows them to other devices, and in the session store, which opens
 * or closes the AI routes immediately.
 *
 * Withdrawing takes effect on this device even if the server cannot be reached; agreeing needs the
 * server to confirm first, so the record of consent always exists before AI is used.
 */
import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase/client';

/** Version of the AI explanation the person agreed to; bump when its substance changes. */
export const AI_TERMS_VERSION = 1;

export interface AiConsentRecord {
  granted: boolean;
  terms_version: number;
  decided_at: string;
}

export function aiConsentRecord(granted: boolean, now: Date): AiConsentRecord {
  return { granted, terms_version: AI_TERMS_VERSION, decided_at: now.toISOString() };
}

async function writeServerRecord(record: AiConsentRecord): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ data: { ai_consent: record } });
  if (error) throw error;
}

/**
 * Saves the answer. Throws when agreeing could not be saved; a withdrawal never throws, it only
 * logs when the server copy could not be updated.
 */
export async function setAiConsent(granted: boolean, now: Date = new Date()): Promise<void> {
  const session = useSessionStore.getState();
  const record = aiConsentRecord(granted, now);
  if (!granted) {
    session.setAiConsent(false);
    try {
      await writeServerRecord(record);
    } catch (error) {
      logger.warn('Could not save AI consent withdrawal to the account', describeError(error));
    }
    return;
  }
  await writeServerRecord(record);
  useSessionStore.getState().setAiConsent(true);
}
