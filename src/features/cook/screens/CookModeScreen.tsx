import { ComingSoon } from '@/ui';

export interface CookModeScreenProps {
  recipeId: string;
}

/** Placeholder until the cook feature ships. */
export function CookModeScreen(_props: CookModeScreenProps) {
  return (
    <ComingSoon
      title="Cook mode"
      description="Step-by-step cooking with timers."
      icon="flame"
      safeTop
    />
  );
}
