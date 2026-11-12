/** zod schemas for every moderation payload the app reads. */
import { z } from 'zod';

import type {
  ModerationActionKind,
  ReportReason,
  ReportTarget,
} from '@/lib/supabase/database.types';

export const REPORT_TARGETS = [
  'post',
  'comment',
  'user',
  'recipe',
] as const satisfies readonly ReportTarget[];

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'self_harm',
  'misinformation',
  'unsafe_food',
  'impersonation',
  'other',
] as const satisfies readonly ReportReason[];

export const MODERATION_ACTIONS = [
  'hide',
  'restore',
  'remove',
  'warn',
  'suspend',
  'unsuspend',
  'dismiss',
] as const satisfies readonly ModerationActionKind[];

export const TargetKindSchema = z.enum(REPORT_TARGETS);
export const ReasonSchema = z.enum(REPORT_REASONS);
export const ActionSchema = z.enum(MODERATION_ACTIONS);

export const APPEAL_STATUSES = ['pending', 'upheld', 'reversed'] as const;

/** A row of `my_moderation_decisions()`. */
export const DecisionSchema = z.object({
  action_id: z.string(),
  action: ActionSchema,
  reason: z.string(),
  target_kind: TargetKindSchema,
  target_id: z.string(),
  automated: z.boolean(),
  suspended_until: z.string().nullable(),
  created_at: z.string(),
  appealable: z.boolean(),
  appeal_status: z.enum(APPEAL_STATUSES).nullable(),
  appeal_note: z.string().nullable(),
});
export type Decision = z.infer<typeof DecisionSchema>;

const MediaSchema = z.object({
  path: z.string(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  blurhash: z.string().nullable().optional(),
  position: z.number().optional(),
});

/** Snapshot of the reported thing, shaped by target kind (see `moderation_queue`). */
export const TargetSnapshotSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
    status: z.enum(['visible', 'hidden', 'removed']).optional(),
    visibility: z.string().optional(),
    recipe_ref: z.string().nullable().optional(),
    post_id: z.string().optional(),
    handle: z.string().optional(),
    display_name: z.string().optional(),
    bio: z.string().optional(),
    suspended_until: z.string().nullable().optional(),
    created_at: z.string().optional(),
    media: z.array(MediaSchema).optional(),
  })
  .nullable();
export type TargetSnapshot = z.infer<typeof TargetSnapshotSchema>;

export const QueueReportSchema = z.object({
  report_id: z.string(),
  reason: ReasonSchema,
  details: z.string(),
  reporter_id: z.string().nullable(),
  automated: z.boolean(),
  created_at: z.string(),
});

export const PreviousActionSchema = z.object({
  action: ActionSchema,
  reason: z.string(),
  created_at: z.string(),
  automated: z.boolean(),
});

export const QueueItemSchema = z.object({
  target_kind: TargetKindSchema,
  target_id: z.string(),
  target_owner_id: z.string().nullable(),
  owner_handle: z.string().nullable(),
  report_count: z.number().int(),
  automated_count: z.number().int(),
  first_reported_at: z.string(),
  last_reported_at: z.string(),
  reports: z.array(QueueReportSchema),
  target: TargetSnapshotSchema,
  previous_actions: z.array(PreviousActionSchema),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const QueuePageSchema = z.object({
  items: z.array(QueueItemSchema),
  next_cursor: z.string().nullable(),
});
export type QueuePage = z.infer<typeof QueuePageSchema>;

/** A `moderation_actions` row with the handles a moderator may see. */
export const AuditEntrySchema = z.object({
  id: z.string(),
  automated: z.boolean(),
  target_kind: TargetKindSchema,
  target_id: z.string(),
  action: ActionSchema,
  reason: z.string(),
  suspended_until: z.string().nullable(),
  created_at: z.string(),
  moderator: z.object({ handle: z.string() }).nullable(),
  owner: z.object({ handle: z.string() }).nullable(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const AUDIT_COLUMNS =
  'id, automated, target_kind, target_id, action, reason, suspended_until, created_at, ' +
  'moderator:profiles!moderation_actions_moderator_id_fkey(handle), ' +
  'owner:profiles!moderation_actions_target_owner_id_fkey(handle)';

export const AppealQueueItemSchema = z.object({
  appeal_id: z.string(),
  appellant_id: z.string(),
  appellant_handle: z.string().nullable(),
  message: z.string(),
  created_at: z.string(),
  action: z.object({
    action_id: z.string(),
    action: ActionSchema,
    reason: z.string(),
    target_kind: TargetKindSchema,
    target_id: z.string(),
    automated: z.boolean(),
    created_at: z.string(),
  }),
});
export type AppealQueueItem = z.infer<typeof AppealQueueItemSchema>;

export const BlockRowSchema = z.object({ blocked_id: z.string(), created_at: z.string() });
export type BlockRow = z.infer<typeof BlockRowSchema>;

/** What is being reported or reviewed. */
export interface TargetRef {
  kind: z.infer<typeof TargetKindSchema>;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECIPE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/** Validates route params into a target, or null when they cannot name one. */
export function parseTargetRef(kind: string | undefined, id: string | undefined): TargetRef | null {
  const parsedKind = TargetKindSchema.safeParse(kind);
  if (!parsedKind.success || !id) return null;
  const valid = parsedKind.data === 'recipe' ? RECIPE_ID.test(id) : UUID.test(id);
  return valid ? { kind: parsedKind.data, id } : null;
}

export function targetKey(target: TargetRef): string {
  return `${target.kind}:${target.id}`;
}
