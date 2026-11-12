/**
 * Presentation of every signed-in stack screen outside the tabs. Kept as data so the `(app)` layout
 * stays a thin loop and the route list is reviewable in one place.
 */
import type { NativeStackNavigationOptions } from 'expo-router';

import { sheetOptions } from '@/ui/navigation';
import type { Theme } from '@/ui/tokens';

export interface AppScreen {
  /** Route name relative to `src/app/(app)`. */
  name: string;
  options: (theme: Theme) => NativeStackNavigationOptions;
}

const titled =
  (title: string, extra: NativeStackNavigationOptions = {}) =>
  (): NativeStackNavigationOptions => ({ title, ...extra });

const fullScreen: NativeStackNavigationOptions = {
  presentation: 'fullScreenModal',
  headerShown: false,
  gestureEnabled: false,
};

export const appScreens: readonly AppScreen[] = [
  { name: '(tabs)', options: () => ({ headerShown: false, title: 'Home' }) },

  // Recipes and cooking
  { name: 'recipe/[id]/index', options: titled('Recipe') },
  { name: 'recipe/[id]/why', options: (t) => sheetOptions(t, [0.55, 1]) },
  { name: 'compare', options: titled('Compare') },
  { name: 'makeover', options: titled('Make it healthier', { presentation: 'modal' }) },
  { name: 'cook/[id]/index', options: () => fullScreen },
  { name: 'cook/[id]/done', options: () => fullScreen },

  // Planning, pantry and shopping
  { name: 'pantry', options: titled('Pantry') },
  { name: 'shopping', options: titled('Shopping list') },
  { name: 'nearby/[dish]', options: titled('Nearby') },

  // AI and Snap results
  { name: 'chef', options: titled('Chef') },
  { name: 'snap/dish', options: titled('Your dish') },
  { name: 'snap/pantry', options: titled('Pantry photo') },

  // Community
  { name: 'post/[id]', options: titled('Post') },
  { name: 'author/[id]', options: titled('') },
  { name: 'compose', options: titled('Share a dish', { presentation: 'modal' }) },
  { name: 'notifications', options: titled('Notifications') },
  { name: 'profile', options: titled('Profile') },
  { name: 'friends', options: titled('Friends') },
  { name: 'invite/[code]', options: (t) => sheetOptions(t, [0.5]) },

  // Settings
  { name: 'settings', options: titled('Settings') },
  { name: 'account', options: titled('Account') },
  { name: 'preferences', options: titled('Preferences') },
  { name: 'personal-details', options: titled('Personal details') },
  { name: 'ai-consent', options: (t) => sheetOptions(t, [0.75, 1]) },
  { name: 'health', options: titled('Health') },

  // Moderation and safety
  { name: 'moderation/index', options: titled('Review queue') },
  { name: 'moderation/report', options: (t) => sheetOptions(t, [0.6, 1]) },
  { name: 'moderation/blocked', options: titled('Blocked people') },
  { name: 'moderation/notice/[id]', options: titled('Content notice') },
];
