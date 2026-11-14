import { Redirect } from 'expo-router';

import { accountSheetHref } from '@/features/auth';

/** The account sheet lives over the welcome carousel; this keeps old links working. */
export default function AuthContinueRoute() {
  return <Redirect href={accountSheetHref({ intent: 'get-started', step: 'providers' })} />;
}
