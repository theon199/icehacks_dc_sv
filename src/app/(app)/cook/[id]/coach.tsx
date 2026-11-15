import { router } from 'expo-router';

import { ComingSoon } from '@/ui';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Placeholder until the screen lands; registered now so parallel work does not collide here. */
export default function AppCookCoachRoute() {
  return (
    <ComingSoon
      title="Cooking coach"
      description="A coach that watches your counter and answers out loud."
      safeTop
      onClose={leave}
    />
  );
}
