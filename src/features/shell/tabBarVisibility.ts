/**
 * Whether the native tab bar is hidden. Screens that own the bottom edge while they are on screen
 * (Search drawing its own bar, Snap's full-bleed camera) hide it under a named reason; the bar
 * stays hidden while any reason is active, so two screens never fight over one flag.
 *
 * Usage from a screen:
 *   useHideTabBar('snap', isFocused);           // hidden while focused, restored on unmount
 *   setTabBarHidden('search', true);            // imperative, e.g. from a focus listener
 *   const hidden = useTabBarHidden();           // read (the tab layout does this)
 */
import { useEffect, useSyncExternalStore } from 'react';

const reasons = new Set<string>();
const listeners = new Set<() => void>();
let hidden = false;

function emit(): void {
  const next = reasons.size > 0;
  if (next === hidden) return;
  hidden = next;
  for (const listener of listeners) listener();
}

/** Adds or clears one reason for hiding the tab bar. Reasons are free-form, e.g. `'search'`. */
export function setTabBarHidden(reason: string, value: boolean): void {
  if (value) reasons.add(reason);
  else reasons.delete(reason);
  emit();
}

/** Current state, outside React. */
export function isTabBarHidden(): boolean {
  return hidden;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while any screen asks for the tab bar to be hidden. */
export function useTabBarHidden(): boolean {
  return useSyncExternalStore(subscribe, isTabBarHidden, isTabBarHidden);
}

/**
 * Hides the tab bar under `reason` while `active` is true, and releases that reason when it turns
 * false or the screen unmounts, so a screen torn down mid-flow never strands the bar hidden.
 */
export function useHideTabBar(reason: string, active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    setTabBarHidden(reason, true);
    return () => setTabBarHidden(reason, false);
  }, [reason, active]);
}

/** Clears every reason. Tests only. */
export function resetTabBarVisibility(): void {
  reasons.clear();
  emit();
}
