import { useLocalSearchParams } from 'expo-router';

import { ReportScreen } from '@/features/moderation/screens/ReportScreen';
import { stringParam } from '@/lib/params';

export default function AppModerationReportRoute() {
  const { target, id, label } = useLocalSearchParams<{
    target?: string;
    id?: string;
    label?: string;
  }>();
  return (
    <ReportScreen
      target={stringParam(target)}
      targetId={stringParam(id)}
      label={stringParam(label)}
    />
  );
}
