import { useLocalSearchParams } from 'expo-router';

import { PostScreen } from '@/features/community/screens/PostScreen';
import { stringParam } from '@/lib/params';

export default function AppPostIdRoute() {
  const { id, comments } = useLocalSearchParams<{ id?: string; comments?: string }>();
  return (
    <PostScreen postId={stringParam(id) ?? ''} focusComments={stringParam(comments) === '1'} />
  );
}
