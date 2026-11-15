import { Redirect } from 'expo-router';

import { accountSheetHref } from '@/features/auth';

/** Creating an account is the email step of the account sheet over the welcome carousel. */
export default function AuthSignUpRoute() {
  return <Redirect href={accountSheetHref({ intent: 'get-started', step: 'email' })} />;
}
