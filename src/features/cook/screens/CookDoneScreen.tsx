import { ComingSoon } from '@/ui';

export interface CookDoneScreenProps {
  recipeId: string;
}

/** Placeholder until the cook feature ships. */
export function CookDoneScreen(_props: CookDoneScreenProps) {
  return (
    <ComingSoon
      title="Nicely done"
      description="Rate the dish and share how it went."
      icon="checkmark.circle"
      safeTop
    />
  );
}
