/**
 * Where Search's back circle goes: the tab the person came from. Search sits in the tab bar like
 * the other tabs, so "back" means switching to the last other tab rather than popping a stack.
 */
import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';

import type { IconName } from '@/ui';

export interface ReturnTarget {
  /** Route name in the tab navigator. */
  tab: string;
  href: '/' | '/cookbook' | '/community' | '/snap';
  label: string;
  icon: IconName;
}

const TARGETS: readonly ReturnTarget[] = [
  { tab: '(discover)', href: '/', label: 'Discover', icon: 'safari' },
  { tab: 'cookbook', href: '/cookbook', label: 'Cookbook', icon: 'bookmark' },
  { tab: 'community', href: '/community', label: 'Community', icon: 'person.2' },
  { tab: 'snap', href: '/snap', label: 'Snap', icon: 'camera' },
];

/** Discover is the first tab, so it is where Search returns before any other tab was seen. */
export const DEFAULT_RETURN_TARGET: ReturnTarget = TARGETS[0] ?? {
  tab: '(discover)',
  href: '/',
  label: 'Discover',
  icon: 'safari',
};

/** The return target for a tab route name, or null for Search itself and unknown routes. */
export function returnTargetFor(tab: string): ReturnTarget | null {
  return TARGETS.find((target) => target.tab === tab) ?? null;
}

/** Picks the focused route's name out of a navigator state event, without trusting its shape. */
export function focusedRouteName(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('state' in data)) return null;
  const { state } = data;
  if (typeof state !== 'object' || state === null) return null;
  if (!('index' in state) || !('routes' in state)) return null;
  const { index, routes } = state;
  if (typeof index !== 'number' || !Array.isArray(routes)) return null;
  const route: unknown = routes[index];
  if (typeof route !== 'object' || route === null || !('name' in route)) return null;
  return typeof route.name === 'string' ? route.name : null;
}

/**
 * Follows the tab navigator above Search and remembers the last tab other than Search. Search stays
 * mounted once opened, so every later visit knows where it came from; the very first visit falls
 * back to Discover.
 */
export function useReturnTarget(): ReturnTarget {
  const navigation = useNavigation();
  const [target, setTarget] = useState<ReturnTarget>(DEFAULT_RETURN_TARGET);
  useEffect(() => {
    const tabs = navigation.getParent();
    if (!tabs) return undefined;
    return tabs.addListener('state', (event: { data: unknown }) => {
      const name = focusedRouteName(event.data);
      const next = name === null ? null : returnTargetFor(name);
      if (next) setTarget(next);
    });
  }, [navigation]);
  return target;
}
