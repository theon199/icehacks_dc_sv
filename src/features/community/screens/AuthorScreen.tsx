import { ComingSoon } from '@/ui';

export interface AuthorScreenProps {
  authorId: string;
}

/** Placeholder until the community feature ships. */
export function AuthorScreen(_props: AuthorScreenProps) {
  return (
    <ComingSoon
      title="Profile"
      description="Recipes and dishes from this cook."
      icon="person.crop.square"
    />
  );
}
