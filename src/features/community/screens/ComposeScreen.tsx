import { ComingSoon } from '@/ui';

export interface ComposeScreenProps {
  recipeId?: string | undefined;
}

/** Placeholder until the community feature ships. */
export function ComposeScreen(_props: ComposeScreenProps) {
  return (
    <ComingSoon
      title="Share a dish"
      description="Post a photo of what you cooked."
      icon="square.and.pencil"
    />
  );
}
