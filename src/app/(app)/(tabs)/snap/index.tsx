import { useLocalSearchParams } from 'expo-router';

import { snapModeParam } from '@/features/snap';
import { SnapScreen } from '@/features/snap/screens/SnapScreen';

export default function AppTabsSnapRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <SnapScreen mode={snapModeParam(mode)} />;
}
