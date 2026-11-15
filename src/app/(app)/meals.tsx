import { router } from 'expo-router';

import { ComingSoon } from '@/ui';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Placeholder until the screen lands; registered now so parallel work does not collide here. */
export default function AppMealsRoute() {
  return (
    <ComingSoon
      title="Meals for now"
      description="Recipes your fridge covers, picked for the time of day."
      safeTop
      onClose={leave}
    />
  );
}
