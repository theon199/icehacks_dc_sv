import { router } from 'expo-router';
import { memo } from 'react';

import { GlassButtonGroup, TabHeader, type GlassButtonGroupItem } from '@/ui';

import { ProfileButton } from '../deps';

/** Shopping list and settings belong together, so they share one glass capsule. */
const ACTIONS: readonly GlassButtonGroupItem[] = [
  {
    icon: 'cart',
    accessibilityLabel: 'Shopping list',
    onPress: () => router.push('/shopping'),
    testID: 'cookbook-shopping',
  },
  {
    icon: 'gearshape',
    accessibilityLabel: 'Settings',
    onPress: () => router.push('/settings'),
    testID: 'cookbook-settings',
  },
];

/**
 * The Cookbook's tab header, floating over the page: the title, the shopping and settings capsule,
 * then the profile circle every tab ends with.
 */
export const CookbookHeader = memo(function CookbookHeader() {
  return (
    <TabHeader
      floating
      title="Cookbook"
      testID="cookbook-header"
      trailing={
        <>
          <GlassButtonGroup items={ACTIONS} testID="cookbook-header-actions" />
          <ProfileButton testID="cookbook-profile" />
        </>
      }
    />
  );
});
