/**
 * Moderator actions and the words members see about them. `availableActions` mirrors the checks
 * in the `moderate` RPC so the review screen only offers what the server will accept.
 */
import type { ModerationActionKind, ReportTarget } from '@/lib/supabase/database.types';

import type { Decision, TargetSnapshot } from './model';
import { targetNoun } from './reasons';

export interface ActionOption {
  action: ModerationActionKind;
  label: string;
  /** Shown under the button so the consequence is clear before confirming. */
  effect: string;
  destructive: boolean;
  /** Suspensions need a length in days (1–365). */
  needsDays: boolean;
}

export const SUSPEND_DAY_CHOICES = [1, 3, 7, 30, 90, 365] as const;

export interface ActionContext {
  kind: ReportTarget;
  hasOwner: boolean;
  snapshot: TargetSnapshot;
}

export function availableActions({ kind, hasOwner, snapshot }: ActionContext): ActionOption[] {
  const options: ActionOption[] = [];
  const status = snapshot?.status;
  if (kind === 'post' || kind === 'comment') {
    if (status !== 'hidden' && status !== 'removed') {
      options.push({
        action: 'hide',
        label: 'Hide',
        effect: `Hides the ${targetNoun(kind)} from everyone but its author while it can be appealed.`,
        destructive: true,
        needsDays: false,
      });
    }
    if (status !== 'removed') {
      options.push({
        action: 'remove',
        label: 'Remove',
        effect: `Takes the ${targetNoun(kind)} down for breaking the guidelines.`,
        destructive: true,
        needsDays: false,
      });
    }
    if (status === 'hidden' || status === 'removed') {
      options.push({
        action: 'restore',
        label: 'Restore',
        effect: `Makes the ${targetNoun(kind)} visible again and closes the reports.`,
        destructive: false,
        needsDays: false,
      });
    }
  }
  if (kind === 'recipe') {
    options.push({
      action: 'remove',
      label: 'Confirm problem',
      effect: 'Records that the recipe needs correcting in the catalog.',
      destructive: false,
      needsDays: false,
    });
  }
  if (hasOwner) {
    options.push({
      action: 'warn',
      label: 'Warn',
      effect: 'Sends the owner a warning with your reason.',
      destructive: false,
      needsDays: false,
    });
    const suspended = kind === 'user' && Boolean(snapshot?.suspended_until);
    if (suspended) {
      options.push({
        action: 'unsuspend',
        label: 'Lift suspension',
        effect: 'Lets the owner post and comment again.',
        destructive: false,
        needsDays: false,
      });
    } else {
      options.push({
        action: 'suspend',
        label: 'Suspend',
        effect: 'Stops the owner posting, commenting and reporting for the chosen time.',
        destructive: true,
        needsDays: true,
      });
    }
  }
  options.push({
    action: 'dismiss',
    label: 'Dismiss reports',
    effect: 'Closes the reports without changing anything.',
    destructive: false,
    needsDays: false,
  });
  return options;
}

const PAST_TENSE: Record<ModerationActionKind, string> = {
  hide: 'Hidden',
  restore: 'Restored',
  remove: 'Removed',
  warn: 'Warned',
  suspend: 'Suspended',
  unsuspend: 'Suspension lifted',
  dismiss: 'Reports dismissed',
};

export function actionPastTense(action: ModerationActionKind): string {
  return PAST_TENSE[action];
}

export const MODERATOR_REASON_MAX = 500;
export const APPEAL_MAX = 1000;

/** Problem with a moderator's reason, or null. */
export function moderatorReasonProblem(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return 'Give a reason. The owner sees it.';
  if (trimmed.length > MODERATOR_REASON_MAX) {
    return `Keep the reason under ${MODERATOR_REASON_MAX} characters.`;
  }
  return null;
}

export interface NoticeCopy {
  title: string;
  body: string;
}

/** What the owner reads on the notice screen. */
export function noticeCopy(decision: Decision): NoticeCopy {
  const noun = targetNoun(decision.target_kind);
  const by = decision.automated ? 'Our automatic checks' : 'A Famara moderator';
  switch (decision.action) {
    case 'hide':
      return {
        title: `Your ${noun} is hidden`,
        body: `${by} hid this ${noun} so only you can see it while it is reviewed.`,
      };
    case 'remove':
      return {
        title: `Your ${noun} was removed`,
        body: `${by} removed this ${noun} because it goes against the community guidelines.`,
      };
    case 'restore':
      return {
        title: `Your ${noun} is back`,
        body: `This ${noun} is visible to the community again.`,
      };
    case 'warn':
      return {
        title: 'You received a warning',
        body: `${by} flagged something you shared. Repeated problems can lead to a suspension.`,
      };
    case 'suspend':
      return {
        title: 'Your account is suspended',
        body: 'You can still cook, plan and browse, but you cannot post, comment or report for now.',
      };
    case 'unsuspend':
      return { title: 'Your suspension was lifted', body: 'You can post and comment again.' };
    case 'dismiss':
      return { title: 'No action taken', body: 'Reports about this were reviewed and closed.' };
  }
}

export function appealStatusText(decision: Decision): string | null {
  switch (decision.appeal_status) {
    case 'pending':
      return 'Your appeal is waiting for a moderator. We will notify you of the outcome.';
    case 'upheld':
      return 'Your appeal was reviewed and the decision stands.';
    case 'reversed':
      return 'Your appeal was accepted and the decision was reversed.';
    default:
      return null;
  }
}
