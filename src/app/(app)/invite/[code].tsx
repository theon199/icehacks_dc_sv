import { useLocalSearchParams } from 'expo-router';

import { InviteScreen } from '@/features/profile/screens/InviteScreen';
import { stringParam } from '@/lib/params';

export default function AppInviteCodeRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <InviteScreen code={stringParam(code) ?? ''} />;
}
