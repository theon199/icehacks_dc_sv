import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  isTabBarHidden,
  resetTabBarVisibility,
  setTabBarHidden,
  useHideTabBar,
  useTabBarHidden,
} from './tabBarVisibility';
import { tabs } from './tabs';

afterEach(() => resetTabBarVisibility());

describe('tab bar visibility', () => {
  it('stays hidden while any reason holds it', () => {
    setTabBarHidden('search', true);
    setTabBarHidden('snap', true);
    setTabBarHidden('search', false);
    expect(isTabBarHidden()).toBe(true);
    setTabBarHidden('snap', false);
    expect(isTabBarHidden()).toBe(false);
  });

  it('ignores clearing a reason that was never set', () => {
    setTabBarHidden('snap', false);
    expect(isTabBarHidden()).toBe(false);
  });

  it('re-renders readers when the bar hides and shows', async () => {
    function Reader() {
      return <Text>{useTabBarHidden() ? 'hidden' : 'shown'}</Text>;
    }
    await render(<Reader />);
    expect(screen.getByText('shown')).toBeOnTheScreen();
    await act(async () => setTabBarHidden('search', true));
    expect(screen.getByText('hidden')).toBeOnTheScreen();
    await act(async () => setTabBarHidden('search', false));
    expect(screen.getByText('shown')).toBeOnTheScreen();
  });

  it('releases a screen hold when the screen unmounts', async () => {
    function Camera({ focused }: { focused: boolean }) {
      useHideTabBar('snap', focused);
      return null;
    }
    const view = await render(<Camera focused />);
    expect(isTabBarHidden()).toBe(true);
    await view.rerender(<Camera focused={false} />);
    expect(isTabBarHidden()).toBe(false);
    await view.rerender(<Camera focused />);
    expect(isTabBarHidden()).toBe(true);
    await view.unmount();
    expect(isTabBarHidden()).toBe(false);
  });
});

describe('tabs', () => {
  it('keeps all five in one bar, Search included, in order', () => {
    expect(tabs.map((t) => t.label)).toEqual([
      'Discover',
      'Cookbook',
      'Community',
      'Snap',
      'Search',
    ]);
    expect(tabs.some((t) => 'role' in t)).toBe(false);
  });
});
