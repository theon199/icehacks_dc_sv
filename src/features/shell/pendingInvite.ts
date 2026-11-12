/**
 * A friend invite link that arrived before the person could act on it.
 *
 * Invite links only resolve inside the signed-in app, so a link opened while signed out or during
 * setup would otherwise be dropped by the root guards. The code is parked here and opened once the
 * session is ready. It is not tied to an account: whoever finishes signing in on this device next
 * is the person who tapped the link. It expires so a stale link never surprises someone days later.
 */
import { z } from 'zod';

import { normalizeInviteCode } from '@/features/profile';
import { defineKvKey } from '@/lib/storage/kv';

/** How long a parked invite waits for sign-up, email confirmation and setup to finish. */
export const PENDING_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

const PendingInviteSchema = z.object({
  code: z.string().min(1).max(64),
  savedAt: z.number().finite(),
});

const pendingInviteKey = defineKvKey('shell.pendingInvite', PendingInviteSchema);

/** Schemes whose URLs carry a host before the route (`https://famara.app/invite/X`). */
const HOSTED_SCHEMES = new Set(['http', 'https', 'exp', 'exps']);

/**
 * The invite code in a deep link, or null when the link is not an invite. Handles the app scheme
 * (`famara://invite/X`), web links and development builds (`exp://host/--/invite/X`).
 */
export function inviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^?#]*)/i.exec(url.trim());
  if (!match) return null;
  const scheme = (match[1] ?? '').toLowerCase();
  let route = match[2] ?? '';
  if (HOSTED_SCHEMES.has(scheme)) {
    const slash = route.indexOf('/');
    route = slash === -1 ? '' : route.slice(slash);
  }
  route = route.replace(/^\/+/, '').replace(/^--\//, '');
  const invite = /^invite\/([^/]+)\/?$/i.exec(route);
  if (!invite?.[1]) return null;
  let raw: string;
  try {
    raw = decodeURIComponent(invite[1]);
  } catch {
    return null;
  }
  return normalizeInviteCode(raw);
}

/** Parks a code for later. Invalid codes are ignored. */
export async function savePendingInvite(code: string, now: number = Date.now()): Promise<void> {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return;
  await pendingInviteKey.set({ code: normalized, savedAt: now });
}

/** Set while a take is reading storage, so two overlapping callers cannot both receive the code. */
let taking = false;

/**
 * Removes the parked code and returns it when it is still valid and fresh. Reading always clears,
 * so an invite opens at most once; a caller that overlaps another take gets null.
 */
export async function takePendingInvite(now: number = Date.now()): Promise<string | null> {
  if (taking) return null;
  taking = true;
  try {
    const stored = await pendingInviteKey.get();
    if (!stored) return null;
    await pendingInviteKey.remove();
    const age = now - stored.savedAt;
    // A clock moved backwards still counts by distance, so a fresh invite is not lost to it.
    if (Math.abs(age) > PENDING_INVITE_TTL_MS) return null;
    return normalizeInviteCode(stored.code);
  } finally {
    taking = false;
  }
}
