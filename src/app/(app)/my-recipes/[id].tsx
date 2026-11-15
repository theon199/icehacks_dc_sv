import { router } from 'expo-router';

import { ComingSoon } from '@/ui';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Placeholder until the screen lands; registered now so parallel work does not collide here. */
export default function AppMyRecipeRoute() {
  return (
    <ComingSoon title="Recipe" description="One of your own recipes." safeTop onClose={leave} />
  );
}
