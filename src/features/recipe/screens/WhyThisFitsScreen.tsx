import { ComingSoon } from '@/ui';

export interface WhyThisFitsScreenProps {
  recipeId: string;
}

/** Placeholder until the recipe feature ships. */
export function WhyThisFitsScreen(_props: WhyThisFitsScreenProps) {
  return (
    <ComingSoon
      title="Why this fits you"
      description="How this recipe matches your goals."
      icon="checkmark.seal"
    />
  );
}
