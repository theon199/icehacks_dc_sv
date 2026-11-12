/**
 * "Did they have it?" answers: one per person, place and dish per calendar day.
 *
 * The server keeps a single answer per person, place and dish and lets it change. The app adds a
 * daily limit so a person cannot flip the tally back and forth: after answering, the prompt turns
 * into a thank-you until the next local day, when they may update their answer.
 */

export interface ConfirmationRecord {
  /** Local calendar day the answer was given, `YYYY-MM-DD`. */
  day: string;
  hadIt: boolean;
}

export type ConfirmationLog = Readonly<Record<string, ConfirmationRecord>>;

/** Records kept on the device; older days are pruned first. */
export const MAX_CONFIRMATION_RECORDS = 300;

/** Key for one person's answer about one dish at one place. */
export function confirmationKey(userId: string, dishKey: string, placeId: string): string {
  return `${userId}|${dishKey}|${placeId}`;
}

/** Local calendar day of a moment, `YYYY-MM-DD`. */
export function localDay(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The answer given today for this key, or null when there is none yet today. */
export function answerToday(log: ConfirmationLog, key: string, now: Date): boolean | null {
  const record = log[key];
  return record && record.day === localDay(now) ? record.hadIt : null;
}

/** Whether the person may answer for this key right now. */
export function canConfirm(log: ConfirmationLog, key: string, now: Date): boolean {
  return answerToday(log, key, now) === null;
}

/**
 * Adds today's answer. Returns the same log when an answer already exists for today, so a second
 * tap (or a retried request) never counts twice. Records from earlier days are dropped once the
 * log grows past its cap, oldest first.
 */
export function withConfirmation(
  log: ConfirmationLog,
  key: string,
  hadIt: boolean,
  now: Date,
): ConfirmationLog {
  if (!canConfirm(log, key, now)) return log;
  const next: Record<string, ConfirmationRecord> = { ...log, [key]: { day: localDay(now), hadIt } };
  const keys = Object.keys(next);
  if (keys.length <= MAX_CONFIRMATION_RECORDS) return next;
  const oldestFirst = keys
    .filter((k) => k !== key)
    .sort((a, b) => (next[a]?.day ?? '').localeCompare(next[b]?.day ?? ''));
  for (const stale of oldestFirst.slice(0, keys.length - MAX_CONFIRMATION_RECORDS)) {
    delete next[stale];
  }
  return next;
}

/** Removes a record, used when the server rejects the answer so the person can try again. */
export function withoutConfirmation(log: ConfirmationLog, key: string): ConfirmationLog {
  if (!(key in log)) return log;
  const next = { ...log };
  delete next[key];
  return next;
}

export type ConfirmationPrompt =
  { kind: 'ask'; previous: boolean | null } | { kind: 'thanks'; hadIt: boolean };

/**
 * What the place sheet shows: a thank-you when the person answered today, otherwise the question
 * (with their earlier answer, from the server, as context).
 */
export function confirmationPrompt(
  log: ConfirmationLog,
  key: string,
  serverAnswer: boolean | null,
  now: Date,
): ConfirmationPrompt {
  const today = answerToday(log, key, now);
  if (today !== null) return { kind: 'thanks', hadIt: today };
  return { kind: 'ask', previous: serverAnswer };
}

export interface Tally {
  yesCount: number;
  noCount: number;
  myAnswer: boolean | null;
}

/**
 * Tally after changing one person's answer, for an optimistic update before the server replies.
 */
export function applyAnswer(tally: Tally, hadIt: boolean): Tally {
  let { yesCount, noCount } = tally;
  if (tally.myAnswer === true) yesCount = Math.max(0, yesCount - 1);
  if (tally.myAnswer === false) noCount = Math.max(0, noCount - 1);
  if (hadIt) yesCount += 1;
  else noCount += 1;
  return { yesCount, noCount, myAnswer: hadIt };
}
