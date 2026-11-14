/** The five tabs, in order. Icons are SF Symbols on iOS and Material Symbols on Android. */
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

export interface TabSpec {
  /** Route name inside `src/app/(app)/(tabs)`. */
  name: string;
  label: string;
  sf: SFSymbol | { default: SFSymbol; selected: SFSymbol };
  md: AndroidSymbol;
}

/**
 * All five share one bar. Search is an ordinary item inside it rather than the iOS `search` role,
 * which iOS 26 lifts out into a separate circle beside the bar.
 */
export const tabs: readonly TabSpec[] = [
  {
    name: '(discover)',
    label: 'Discover',
    sf: { default: 'safari', selected: 'safari.fill' },
    md: 'explore',
  },
  {
    name: 'cookbook',
    label: 'Cookbook',
    sf: { default: 'bookmark', selected: 'bookmark.fill' },
    md: 'menu_book',
  },
  {
    name: 'community',
    label: 'Community',
    sf: { default: 'person.2', selected: 'person.2.fill' },
    md: 'groups',
  },
  {
    name: 'snap',
    label: 'Snap',
    sf: { default: 'camera', selected: 'camera.fill' },
    md: 'photo_camera',
  },
  {
    name: 'search',
    label: 'Search',
    sf: 'magnifyingglass',
    md: 'search',
  },
];
