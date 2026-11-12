import { ComingSoon } from '@/ui';

export interface PostScreenProps {
  postId: string;
}

/** Placeholder until the community feature ships. */
export function PostScreen(_props: PostScreenProps) {
  return <ComingSoon title="Post" description="A dish someone cooked and shared." icon="photo" />;
}
