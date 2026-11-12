/** React Query hooks for safety (members) and review (moderators). */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionStore } from '@/features/auth';
import type { ReportReason, Enums } from '@/lib/supabase/database.types';

import {
  blockUser,
  decideAppeal,
  fetchAppealQueue,
  fetchAuditPage,
  fetchBlocks,
  fetchMyDecisions,
  fetchMyRoles,
  fetchQueue,
  moderate,
  reportContent,
  submitAppeal,
  unblockUser,
  type AuditPage,
  type ModerateInput,
} from './api';
import { useBlockedDirectory, type BlockedPerson } from './blockedDirectory';
import { targetKey, type TargetRef } from './model';
import { fetchReviewTarget, fetchTargetReports } from './reviewTarget';

type ReportStatus = Enums<'report_status'>;

export const moderationKeys = {
  all: ['moderation'] as const,
  roles: (userId: string | null) => ['moderation', 'roles', userId] as const,
  blocks: (userId: string | null) => ['moderation', 'blocks', userId] as const,
  decisions: (userId: string | null) => ['moderation', 'decisions', userId] as const,
  queue: (status: ReportStatus) => ['moderation', 'queue', status] as const,
  appeals: ['moderation', 'appeals'] as const,
  audit: (target: TargetRef | null) =>
    ['moderation', 'audit', target ? targetKey(target) : 'all'] as const,
  target: (target: TargetRef) => ['moderation', 'target', targetKey(target)] as const,
  targetReports: (target: TargetRef) => ['moderation', 'reports', targetKey(target)] as const,
};

function useReadyUserId(): string | null {
  return useSessionStore((s) => (s.status === 'ready' ? s.userId : null));
}

/** Roles that grant the review tools. `admin` implies moderator. */
export function hasModeratorRole(roles: readonly string[] | undefined): boolean {
  return roles?.some((role) => role === 'moderator' || role === 'admin') ?? false;
}

export interface ModeratorStatus {
  isModerator: boolean;
  /** True until the roles are known; gate content on this to avoid flashing a "no access" screen. */
  isLoading: boolean;
  /** Set when the roles could not be read; the member is treated as not a moderator. */
  error: Error | null;
  retry: () => void;
}

/**
 * Whether the signed-in member may use the review tools. The server enforces this on every
 * moderator RPC and table; the app uses it only to decide what to show.
 */
export function useIsModerator(): ModeratorStatus {
  const userId = useReadyUserId();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: moderationKeys.roles(userId),
    queryFn: fetchMyRoles,
    enabled: userId != null,
    staleTime: 5 * 60_000,
  });
  return {
    isModerator: hasModeratorRole(data),
    isLoading: userId != null && isPending && error == null,
    error,
    retry: () => void refetch(),
  };
}

// Members -------------------------------------------------------------------------------------

export interface ReportInput {
  target: TargetRef;
  reason: ReportReason;
  details: string;
}

export function useReport() {
  return useMutation({
    mutationFn: ({ target, reason, details }: ReportInput) =>
      reportContent(target, reason, details),
  });
}

export function useBlocks() {
  const userId = useReadyUserId();
  return useQuery({
    queryKey: moderationKeys.blocks(userId),
    queryFn: fetchBlocks,
    enabled: userId != null,
  });
}

/**
 * Blocking changes what every social screen may show, so all cached social data is refreshed.
 * Only queries on screen refetch straight away; the rest refetch when next used.
 */
function useRefreshAfterBlockChange() {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}

export interface BlockTarget extends BlockedPerson {
  userId: string;
}

export function useBlockUser() {
  const userId = useReadyUserId();
  const remember = useBlockedDirectory((s) => s.remember);
  const refresh = useRefreshAfterBlockChange();
  return useMutation({
    mutationFn: (target: BlockTarget) => blockUser(target.userId),
    onSuccess: (_result, target) => {
      if (userId) {
        remember(userId, target.userId, { displayName: target.displayName, handle: target.handle });
      }
      return refresh();
    },
  });
}

export function useUnblockUser() {
  const userId = useReadyUserId();
  const forget = useBlockedDirectory((s) => s.forget);
  const refresh = useRefreshAfterBlockChange();
  return useMutation({
    mutationFn: (blockedId: string) => unblockUser(blockedId),
    onSuccess: (_result, blockedId) => {
      if (userId) forget(userId, blockedId);
      return refresh();
    },
  });
}

export function useMyDecisions() {
  const userId = useReadyUserId();
  return useQuery({
    queryKey: moderationKeys.decisions(userId),
    queryFn: () => fetchMyDecisions(),
    enabled: userId != null,
  });
}

export function useAppeal() {
  const client = useQueryClient();
  const userId = useReadyUserId();
  return useMutation({
    mutationFn: ({ actionId, message }: { actionId: string; message: string }) =>
      submitAppeal(actionId, message),
    onSuccess: () => client.invalidateQueries({ queryKey: moderationKeys.decisions(userId) }),
  });
}

// Moderators ----------------------------------------------------------------------------------

export function useQueue(status: ReportStatus, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: moderationKeys.queue(status),
    queryFn: ({ pageParam }) => fetchQueue(status, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled,
    staleTime: 15_000,
  });
}

export function useAuditLog(target: TargetRef | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: moderationKeys.audit(target),
    queryFn: ({ pageParam }) => fetchAuditPage(pageParam, target ?? undefined),
    initialPageParam: null as AuditPage['next'],
    getNextPageParam: (last) => last.next,
    enabled,
  });
}

/** The target as it is now (status, owner, photos), independent of the open queue. */
export function useReviewTarget(target: TargetRef, enabled: boolean) {
  return useQuery({
    queryKey: moderationKeys.target(target),
    queryFn: () => fetchReviewTarget(target),
    enabled,
    // Photo links are signed for an hour; refetching well before that keeps them valid.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useTargetReports(target: TargetRef, enabled: boolean) {
  return useQuery({
    queryKey: moderationKeys.targetReports(target),
    queryFn: () => fetchTargetReports(target),
    enabled,
  });
}

export function useAppealQueue(enabled: boolean) {
  return useQuery({ queryKey: moderationKeys.appeals, queryFn: () => fetchAppealQueue(), enabled });
}

/** After any decision the queue, appeals and audit log are refreshed. */
export function useModerate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ModerateInput) => moderate(input),
    onSuccess: () => client.invalidateQueries({ queryKey: moderationKeys.all }),
  });
}

export function useDecideAppeal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { appealId: string; outcome: 'upheld' | 'reversed'; note: string }) =>
      decideAppeal(input.appealId, input.outcome, input.note),
    onSuccess: () => client.invalidateQueries({ queryKey: moderationKeys.all }),
  });
}
