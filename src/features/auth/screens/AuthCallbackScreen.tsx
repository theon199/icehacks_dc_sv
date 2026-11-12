import { ComingSoon } from '@/ui';

export interface AuthCallbackScreenProps {
  params: Record<string, string>;
}

/** Placeholder until the auth feature ships. */
export function AuthCallbackScreen(_props: AuthCallbackScreenProps) {
  return (
    <ComingSoon
      title="Signing you in"
      description="Finishing sign-in from your email link."
      icon="arrow.triangle.2.circlepath"
      safeTop
    />
  );
}
