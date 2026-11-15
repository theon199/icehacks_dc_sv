import { router } from 'expo-router';

import { ComingSoon } from '@/ui';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Placeholder until the screen lands; registered now so parallel work does not collide here. */
export default function AppMyRecipesRoute() {
  return (
    <ComingSoon
      title="My recipes"
      description="Family recipes and links you bring in."
      safeTop
      onClose={leave}
    />
  );
}
