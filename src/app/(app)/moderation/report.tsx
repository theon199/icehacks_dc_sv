import { useLocalSearchParams } from 'expo-router';

import { ReportScreen } from '@/features/moderation/screens/ReportScreen';
import { stringParam } from '@/lib/params';

export default function AppModerationReportRoute() {
  const { target, id } = useLocalSearchParams<{ target?: string; id?: string }>();
  return <ReportScreen target={stringParam(target)} targetId={stringParam(id)} />;
}
