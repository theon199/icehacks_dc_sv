import { ComingSoon } from '@/ui';

export interface ChefScreenProps {
  threadId?: string | undefined;
}

/** Placeholder until the chef feature ships. */
export function ChefScreen(_props: ChefScreenProps) {
  return (
    <ComingSoon
      title="Chef"
      description="Ask about recipes, swaps and cooking."
      icon="bubble.left.and.text.bubble.right"
    />
  );
}
