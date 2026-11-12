import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { parseCookShare, type ComposeRouteParams } from '@/features/community/logic/composeParams';
import { ComposeScreen } from '@/features/community/screens/ComposeScreen';
import { stringParam } from '@/lib/params';

export default function AppComposeRoute() {
  const { recipe, remix, from, rating, note, photo, photoWidth, photoHeight } =
    useLocalSearchParams<Record<keyof ComposeRouteParams, string>>();
  const cookShare = useMemo(
    () => parseCookShare({ from, rating, note, photo, photoWidth, photoHeight }),
    [from, note, photo, photoHeight, photoWidth, rating],
  );
  return (
    <ComposeScreen
      recipeId={stringParam(recipe)}
      remixOf={stringParam(remix)}
      cookShare={cookShare}
    />
  );
}
