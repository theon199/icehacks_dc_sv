import { router } from 'expo-router';

import { ComingSoon } from '@/ui';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Placeholder until the screen lands; registered now so parallel work does not collide here. */
export default function AppMyRecipeReviewRoute() {
  return (
    <ComingSoon
      title="Review"
      description="Check a recipe before it joins your suggestions."
      safeTop
      onClose={leave}
    />
  );
}
