import { ComingSoon } from '@/ui';

export interface InviteScreenProps {
  code: string;
}

/** Placeholder until the profile feature ships. */
export function InviteScreen(_props: InviteScreenProps) {
  return (
    <ComingSoon
      title="Invitation"
      description="Accept an invitation to connect."
      icon="envelope.open"
    />
  );
}
