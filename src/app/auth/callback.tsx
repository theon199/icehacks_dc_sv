import { useLocalSearchParams } from 'expo-router';

import { AuthCallbackScreen } from '@/features/auth/screens/AuthCallbackScreen';
import { stringParam } from '@/lib/params';

/** Landing route for email confirmation, magic link and password recovery links. */
export default function AuthCallbackRoute() {
  const raw = useLocalSearchParams();
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = stringParam(value);
    if (v !== undefined) params[key] = v;
  }
  return <AuthCallbackScreen params={params} />;
}
