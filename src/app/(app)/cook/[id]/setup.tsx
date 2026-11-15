import { router } from 'expo-router';

import { ComingSoon } from '@/ui';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Placeholder until the screen lands; registered now so parallel work does not collide here. */
export default function AppCookSetupRoute() {
  return (
    <ComingSoon
      title="Set up your phone"
      description="Mount your phone so the coach can see your counter."
      safeTop
      onClose={leave}
    />
  );
}
