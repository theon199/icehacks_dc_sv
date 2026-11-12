/** Reports, blocks, decisions and the moderator tools, over RLS-protected tables and RPCs. */
import { z } from 'zod';

import { supabase } from '@/lib/supabase/client';
import type { Enums, ModerationActionKind, ReportReason } from '@/lib/supabase/database.types';

import {
  AppealQueueItemSchema,
  AUDIT_COLUMNS,
  AuditEntrySchema,
  BlockRowSchema,
  DecisionSchema,
  QueuePageSchema,
  type AuditEntry,
  type TargetRef,
} from './model';
import { callRpc, parseResult, toApiError } from './rpc';

const Uuid = z.string().min(1);
const Void = z.unknown();

// Member actions ------------------------------------------------------------------------------

export function reportContent(target: TargetRef, reason: ReportReason, details: string) {
  return callRpc(
    'report_content',
    {
      p_target_kind: target.kind,
      p_target_id: target.id,
      p_reason: reason,
      p_details: details.trim(),
    },
    Uuid,
  );
}

export async function blockUser(userId: string): Promise<void> {
  await callRpc('block_user', { p_user_id: userId }, Void);
}

export async function unblockUser(userId: string): Promise<void> {
  await callRpc('unblock_user', { p_user_id: userId }, Void);
}

/** The caller's blocks, newest first (RLS limits `blocks` to rows the caller created). */
export async function fetchBlocks() {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw toApiError('blocks', error);
  return parseResult('blocks', z.array(BlockRowSchema), data);
}

export function fetchMyDecisions(limit = 100) {
  return callRpc('my_moderation_decisions', { p_limit: limit }, z.array(DecisionSchema));
}

export function submitAppeal(actionId: string, message: string) {
  return callRpc('appeal', { p_action_id: actionId, p_message: message.trim() }, Uuid);
}

/** Roles of the signed-in member (RLS limits `user_roles` to the caller's own rows). */
export async function fetchMyRoles(): Promise<string[]> {
  const { data, error } = await supabase.from('user_roles').select('role');
  if (error) throw toApiError('user_roles', error);
  return parseResult('user_roles', z.array(z.object({ role: z.string() })), data).map(
    (r) => r.role,
  );
}

// Moderator tools -----------------------------------------------------------------------------

export function fetchQueue(status: Enums<'report_status'>, cursor: string | null, limit = 25) {
  return callRpc(
    'moderation_queue',
    { p_status: status, p_limit: limit, ...(cursor ? { p_cursor: cursor } : {}) },
    QueuePageSchema,
  );
}

export interface ModerateInput {
  target: TargetRef;
  action: ModerationActionKind;
  reason: string;
  suspendDays?: number;
}

export function moderate({ target, action, reason, suspendDays }: ModerateInput) {
  return callRpc(
    'moderate',
    {
      p_target_kind: target.kind,
      p_target_id: target.id,
      p_action: action,
      p_reason: reason.trim(),
      ...(action === 'suspend' && suspendDays ? { p_suspend_days: suspendDays } : {}),
    },
    Uuid,
  );
}

export function fetchAppealQueue(limit = 50) {
  return callRpc('appeal_queue', { p_limit: limit }, z.array(AppealQueueItemSchema));
}

export async function decideAppeal(
  appealId: string,
  outcome: 'upheld' | 'reversed',
  note: string,
): Promise<void> {
  const trimmed = note.trim();
  await callRpc(
    'decide_appeal',
    { p_appeal_id: appealId, p_outcome: outcome, ...(trimmed ? { p_note: trimmed } : {}) },
    Void,
  );
}

export const AUDIT_PAGE_SIZE = 30;

export interface AuditPage {
  items: AuditEntry[];
  next: { createdAt: string; id: string } | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PostgREST filter for a member's whole history: everything done to them or to anything they
 * wrote. Actions on their posts and comments carry them as `target_owner_id`; actions on the
 * account itself also match by id, so they still show if the owner link was cleared. Null when the
 * id is not a well-formed uuid, which is the only thing ever placed inside the expression.
 */
export function memberHistoryFilter(userId: string): string | null {
  if (!UUID_PATTERN.test(userId)) return null;
  return `target_owner_id.eq.${userId},and(target_kind.eq.user,target_id.eq.${userId})`;
}

/** Audit log, newest first, optionally for one target. Moderators only (RLS). */
export async function fetchAuditPage(
  cursor: AuditPage['next'],
  target?: TargetRef,
  limit = AUDIT_PAGE_SIZE,
): Promise<AuditPage> {
  let query = supabase
    .from('moderation_actions')
    .select(AUDIT_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  const memberFilter = target?.kind === 'user' ? memberHistoryFilter(target.id) : null;
  if (memberFilter) query = query.or(memberFilter);
  else if (target) query = query.eq('target_kind', target.kind).eq('target_id', target.id);
  if (cursor) {
    const at = `"${cursor.createdAt}"`;
    query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${cursor.id})`);
  }
  const { data, error } = await query;
  if (error) throw toApiError('moderation_actions', error);
  const items = parseResult('moderation_actions', z.array(AuditEntrySchema), data);
  const last = items[items.length - 1];
  return {
    items,
    next: items.length === limit && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}
