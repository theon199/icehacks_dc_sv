import { useLocalSearchParams } from 'expo-router';

import { AuthorScreen } from '@/features/community/screens/AuthorScreen';
import { stringParam } from '@/lib/params';

export default function AppAuthorIdRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <AuthorScreen authorId={stringParam(id) ?? ''} />;
}
