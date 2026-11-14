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
  /**
   * AI-powered screen: only mounted for people who are 18+ and have agreed to the AI terms, so a
   * deep link cannot open it either. `ai-consent` itself is never gated, so features can send
   * people there to opt in.
   */
  ai?: true;
}

/** Screens that draw their own glass back button and title hide the native bar. */
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
  { name: 'recipe/[id]/index', options: titled('Recipe', { headerShown: false }) },
  { name: 'recipe/[id]/why', options: (t) => sheetOptions(t, [0.55, 1]) },
  { name: 'compare', options: titled('Compare', { headerShown: false }) },
  {
    name: 'makeover',
    options: titled('Make it healthier', { headerShown: false, presentation: 'modal' }),
    ai: true,
  },
  { name: 'cook/[id]/index', options: () => fullScreen },
  { name: 'cook/[id]/done', options: () => fullScreen },

  // Planning, pantry and shopping
  { name: 'pantry', options: titled('Pantry', { headerShown: false }) },
  { name: 'shopping', options: titled('Shopping list', { headerShown: false }) },
  { name: 'nearby/[dish]', options: titled('Nearby', { headerShown: false }) },

  // AI and Snap results
  { name: 'chef', options: titled('Chef', { headerShown: false }), ai: true },
  { name: 'snap/dish', options: titled('Your dish', { headerShown: false }), ai: true },
  { name: 'snap/pantry', options: titled('Pantry photo', { headerShown: false }), ai: true },

  // Community
  { name: 'post/[id]', options: titled('Post', { headerShown: false }) },
  { name: 'author/[id]', options: titled('', { headerShown: false }) },
  // A tall sheet that keeps its header, so the screen's Close button stays reachable.
  {
    name: 'compose',
    options: (t) => ({ ...sheetOptions(t, [0.9, 1]), headerShown: true, title: 'Share a dish' }),
  },
  { name: 'notifications', options: titled('Notifications', { headerShown: false }) },
  { name: 'profile', options: titled('Profile', { headerShown: false }) },
  { name: 'friends', options: titled('Friends', { headerShown: false }) },
  { name: 'invite/[code]', options: (t) => sheetOptions(t, [0.5]) },

  // Settings
  { name: 'settings', options: titled('Settings', { headerShown: false }) },
  { name: 'account', options: titled('Account', { headerShown: false }) },
  { name: 'preferences', options: titled('Preferences', { headerShown: false }) },
  { name: 'personal-details', options: titled('Personal details', { headerShown: false }) },
  { name: 'ai-consent', options: (t) => sheetOptions(t, [0.75, 1]) },
  { name: 'health', options: titled('Health') },

  // Moderation and safety
  { name: 'moderation/index', options: titled('Review queue', { headerShown: false }) },
  { name: 'moderation/review', options: titled('Review', { headerShown: false }) },
  { name: 'moderation/report', options: (t) => sheetOptions(t, [0.6, 1]) },
  { name: 'moderation/blocked', options: titled('Blocked people', { headerShown: false }) },
  { name: 'moderation/notice/[id]', options: titled('Content notice', { headerShown: false }) },
];
