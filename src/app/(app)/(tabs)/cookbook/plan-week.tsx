import { useLocalSearchParams } from 'expo-router';

import { PlanWeekScreen } from '@/features/cookbook';
import { stringParam } from '@/lib/params';

export default function CookbookPlanWeekRoute() {
  const { week } = useLocalSearchParams<{ week?: string | string[] }>();
  return <PlanWeekScreen week={stringParam(week)} />;
}
