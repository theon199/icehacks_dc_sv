import { useLocalSearchParams } from 'expo-router';

import { ModerationReviewScreen } from '@/features/moderation/screens/ModerationReviewScreen';
import { stringParam } from '@/lib/params';

export default function AppModerationReviewRoute() {
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  return <ModerationReviewScreen kind={stringParam(kind)} targetId={stringParam(id)} />;
}
