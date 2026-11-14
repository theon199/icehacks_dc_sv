import { NativeTabs, type NativeTabsProps } from 'expo-router/unstable-native-tabs';

import { useTabBarHidden } from '@/features/shell';
import { tabs } from '@/features/shell/tabs';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/ui';

/** The tab showing now, from `focus` events. `tabPress` fires before the switch. */
let focusedTab: string | null = null;

/** A selection haptic when a press actually changes tab. */
const screenListeners: NonNullable<NativeTabsProps['screenListeners']> = ({ route }) => ({
  focus: () => {
    focusedTab = route.name;
  },
  tabPress: () => {
    if (route.name !== focusedTab) haptics.selection();
  },
});

/**
 * The system tab bar (Liquid Glass on iOS 26): five items in one bar, minimised while content
 * scrolls down. Search and Snap hide it while they own the bottom edge (`useHideTabBar`). The tint
 * is ink, not lime: lime on light glass all but disappears.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const hidden = useTabBarHidden();
  return (
    <NativeTabs
      hidden={hidden}
      tintColor={theme.colors.primary}
      minimizeBehavior="onScrollDown"
      screenListeners={screenListeners}
    >
      {tabs.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name} accessibilityLabel={tab.label}>
          <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
