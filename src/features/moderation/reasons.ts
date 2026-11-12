/** Report reasons as members see them, and which ones fit each kind of target. */
import type { ReportReason, ReportTarget } from '@/lib/supabase/database.types';

export interface ReasonOption {
  value: ReportReason;
  label: string;
  hint: string;
}

const OPTIONS: Record<ReportReason, Omit<ReasonOption, 'value'>> = {
  spam: {
    label: 'Spam or scam',
    hint: 'Ads, fake giveaways, repeated posts or bought engagement.',
  },
  harassment: {
    label: 'Harassment or bullying',
    hint: 'Insulting, threatening or singling someone out.',
  },
  hate: { label: 'Hate', hint: 'Attacks people for who they are or where they come from.' },
  sexual: { label: 'Sexual content', hint: 'Nudity or sexual material.' },
  violence: { label: 'Violence or threats', hint: 'Graphic violence or encouraging harm.' },
  self_harm: {
    label: 'Self-harm or disordered eating',
    hint: 'Promotes self-harm, extreme restriction or purging.',
  },
  misinformation: {
    label: 'Misleading health claims',
    hint: 'Says a food cures, treats or prevents illness, or gets nutrition badly wrong.',
  },
  unsafe_food: {
    label: 'Unsafe food handling',
    hint: 'Advice that could make someone ill, like undercooking or unsafe storage.',
  },
  impersonation: {
    label: 'Pretending to be someone else',
    hint: 'Posing as another person, a brand or Famara staff.',
  },
  other: { label: 'Something else', hint: 'Tell us what is wrong in the details below.' },
};

const BY_TARGET: Record<ReportTarget, readonly ReportReason[]> = {
  post: [
    'spam',
    'harassment',
    'hate',
    'sexual',
    'violence',
    'self_harm',
    'misinformation',
    'unsafe_food',
    'other',
  ],
  comment: [
    'spam',
    'harassment',
    'hate',
    'sexual',
    'violence',
    'self_harm',
    'misinformation',
    'unsafe_food',
    'other',
  ],
  user: ['impersonation', 'spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'other'],
  recipe: ['unsafe_food', 'misinformation', 'other'],
};

export function reasonsFor(kind: ReportTarget): ReasonOption[] {
  return BY_TARGET[kind].map((value) => ({ value, ...OPTIONS[value] }));
}

export function reasonLabel(reason: ReportReason): string {
  return OPTIONS[reason].label;
}

export const DETAILS_MAX = 1000;
/** "Something else" needs a few words so a moderator knows what to look for. */
export const OTHER_DETAILS_MIN = 10;

export interface ReportDraft {
  reason: ReportReason | null;
  details: string;
}

/** Why the draft cannot be sent yet, or null when it is ready. */
export function reportDraftProblem(kind: ReportTarget, draft: ReportDraft): string | null {
  if (!draft.reason) return 'Choose a reason.';
  if (!BY_TARGET[kind].includes(draft.reason)) return 'Choose a reason from the list.';
  const details = draft.details.trim();
  if (details.length > DETAILS_MAX) return `Keep the details under ${DETAILS_MAX} characters.`;
  if (draft.reason === 'other' && details.length < OTHER_DETAILS_MIN) {
    return 'Tell us a little more about the problem.';
  }
  return null;
}

const NOUNS: Record<ReportTarget, string> = {
  post: 'post',
  comment: 'comment',
  user: 'profile',
  recipe: 'recipe',
};

export function targetNoun(kind: ReportTarget): string {
  return NOUNS[kind];
}
