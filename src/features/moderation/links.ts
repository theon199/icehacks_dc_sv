/** Links other features use to open the safety screens. */
import type { Href } from 'expo-router';

import type { TargetRef } from './model';

/** The report sheet for a post, comment, member or recipe. `label` is shown in its copy. */
export function reportHref(target: TargetRef, label?: string): Href {
  return {
    pathname: '/moderation/report',
    params: label
      ? { target: target.kind, id: target.id, label }
      : { target: target.kind, id: target.id },
  };
}

export const blockedPeopleHref: Href = '/moderation/blocked';
export const reviewQueueHref: Href = '/moderation';

/** The moderator review of one target: what it is now, its reports, history and the decision. */
export function reviewHref(target: TargetRef): Href {
  return { pathname: '/moderation/review', params: { kind: target.kind, id: target.id } };
}
