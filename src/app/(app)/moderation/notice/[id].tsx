import { useLocalSearchParams } from 'expo-router';

import { ModerationNoticeScreen } from '@/features/moderation/screens/ModerationNoticeScreen';
import { stringParam } from '@/lib/params';

export default function AppModerationNoticeIdRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ModerationNoticeScreen noticeId={stringParam(id) ?? ''} />;
}
