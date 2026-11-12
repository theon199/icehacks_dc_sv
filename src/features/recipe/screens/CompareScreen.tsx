import { ComingSoon } from '@/ui';

export interface CompareScreenProps {
  fromId?: string | undefined;
  toId?: string | undefined;
}

/** Placeholder until the recipe feature ships. */
export function CompareScreen(_props: CompareScreenProps) {
  return (
    <ComingSoon
      title="Compare"
      description="The original next to its healthier version."
      icon="arrow.left.arrow.right"
    />
  );
}
