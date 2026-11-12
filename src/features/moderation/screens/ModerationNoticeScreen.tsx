import { ComingSoon } from '@/ui';

export interface ModerationNoticeScreenProps {
  noticeId: string;
}

/** Placeholder until the moderation feature ships. */
export function ModerationNoticeScreen(_props: ModerationNoticeScreenProps) {
  return (
    <ComingSoon
      title="Content notice"
      description="What happened and how to appeal."
      icon="exclamationmark.bubble"
    />
  );
}
