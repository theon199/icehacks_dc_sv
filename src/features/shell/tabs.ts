/** The five tabs, in order. Icons are SF Symbols on iOS and Material Symbols on Android. */
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

export interface TabSpec {
  /** Route name inside `src/app/(app)/(tabs)`. */
  name: string;
  label: string;
  sf: { default: SFSymbol; selected: SFSymbol };
  md: AndroidSymbol;
  /** iOS 26 places the `search` role tab apart from the others. */
  role?: 'search';
}

export const tabs: readonly TabSpec[] = [
  {
    name: '(discover)',
    label: 'Discover',
    sf: { default: 'sparkles', selected: 'sparkles' },
    md: 'explore',
  },
  {
    name: 'cookbook',
    label: 'Cookbook',
    sf: { default: 'book.closed', selected: 'book.closed.fill' },
    md: 'menu_book',
  },
  {
    name: 'snap',
    label: 'Snap',
    sf: { default: 'camera', selected: 'camera.fill' },
    md: 'photo_camera',
  },
  {
    name: 'community',
    label: 'Community',
    sf: { default: 'person.2', selected: 'person.2.fill' },
    md: 'groups',
  },
  {
    name: 'search',
    label: 'Search',
    sf: { default: 'magnifyingglass', selected: 'magnifyingglass' },
    md: 'search',
    role: 'search',
  },
];
