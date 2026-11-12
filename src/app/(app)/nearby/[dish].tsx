import { useLocalSearchParams } from 'expo-router';

import { NearbyScreen } from '@/features/nearby/screens/NearbyScreen';
import { stringParam } from '@/lib/params';

export default function AppNearbyDishRoute() {
  const { dish } = useLocalSearchParams<{ dish?: string }>();
  return <NearbyScreen dish={stringParam(dish) ?? ''} />;
}
