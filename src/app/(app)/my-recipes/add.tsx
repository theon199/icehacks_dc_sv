import { router } from 'expo-router';

import { ComingSoon } from '@/ui';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Placeholder until the screen lands; registered now so parallel work does not collide here. */
export default function AppMyRecipeAddRoute() {
  return (
    <ComingSoon
      title="Add a recipe"
      description="Bring in a recipe from a link, a photo or your own words."
      safeTop
      onClose={leave}
    />
  );
}
