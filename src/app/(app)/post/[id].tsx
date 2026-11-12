import { useLocalSearchParams } from 'expo-router';

import { PostScreen } from '@/features/community/screens/PostScreen';
import { stringParam } from '@/lib/params';

export default function AppPostIdRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <PostScreen postId={stringParam(id) ?? ''} />;
}
