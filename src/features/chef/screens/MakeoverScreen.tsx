import { ComingSoon } from '@/ui';

export interface MakeoverScreenProps {
  recipeId?: string | undefined;
}

/** Placeholder until the chef feature ships. */
export function MakeoverScreen(_props: MakeoverScreenProps) {
  return (
    <ComingSoon
      title="Make it healthier"
      description="Swap ingredients for a goal you choose."
      icon="wand.and.stars"
    />
  );
}
