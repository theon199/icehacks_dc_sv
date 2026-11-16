import { router } from 'expo-router';
import { useCallback, useMemo, type ReactNode, type RefObject } from 'react';
import type { View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { GlassMenu, useGlassMenu, type GlassMenuItem, type TabHeaderTitleMenu } from '@/ui';

export type CommunityView = 'feed' | 'map';

export const COMMUNITY_VIEWS: readonly {
  value: CommunityView;
  label: string;
  detail: string;
}[] = [
  { value: 'feed', label: 'Feed', detail: 'Posts from the community' },
  { value: 'map', label: 'Food map', detail: 'Where you eat, and what to try' },
];

function open(view: CommunityView) {
  router.replace(view === 'map' ? '/community/map' : '/community');
}

/**
 * The Community title as a menu: Feed or Food map, the current one checked. Spread `titleMenu`
 * into the `TabHeader` and render `menu` beside it.
 */
export function useCommunityViewMenu(current: CommunityView): {
  title: string;
  titleMenu: TabHeaderTitleMenu;
  titleMenuRef: RefObject<View | null>;
  menu: ReactNode;
} {
  const controller = useGlassMenu({ align: 'left' });
  const { show } = controller;
  const onPress = useCallback(() => {
    haptics.selection();
    show();
  }, [show]);
  const items = useMemo<GlassMenuItem[]>(
    () =>
      COMMUNITY_VIEWS.map((view) => ({
        key: view.value,
        label: view.label,
        detail: view.detail,
        icon: view.value === 'map' ? 'map' : 'person.2',
        selected: view.value === current,
        testID: `community-view-${view.value}`,
        onPress: () => {
          if (view.value !== current) open(view.value);
        },
      })),
    [current],
  );
  const title = COMMUNITY_VIEWS.find((view) => view.value === current)?.label ?? 'Community';
  return {
    title,
    titleMenuRef: controller.triggerRef,
    titleMenu: {
      onPress,
      expanded: controller.open,
      accessibilityHint: 'Choose between the feed and the food map',
      testID: 'community-view',
    },
    menu: (
      <GlassMenu
        controller={controller}
        items={items}
        dismissLabel="Close the Community menu"
        testID="community-view-menu"
      />
    ),
  };
}
