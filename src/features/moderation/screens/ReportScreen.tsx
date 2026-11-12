import { ComingSoon } from '@/ui';

export interface ReportScreenProps {
  target?: string | undefined;
  targetId?: string | undefined;
}

/** Placeholder until the moderation feature ships. */
export function ReportScreen(_props: ReportScreenProps) {
  return (
    <ComingSoon title="Report" description="Tell us what is wrong with this content." icon="flag" />
  );
}
