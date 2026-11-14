import { Redirect } from 'expo-router';

import { accountSheetHref } from '@/features/auth';

/** Log in is the email step of the account sheet over the welcome carousel. */
export default function AuthSignInRoute() {
  return <Redirect href={accountSheetHref({ intent: 'log-in', step: 'email' })} />;
}
