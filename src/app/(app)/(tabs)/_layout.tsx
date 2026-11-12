import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { tabs } from '@/features/shell/tabs';
import { useTheme } from '@/ui';
import { fontFamily } from '@/ui/tokens';

/** Native tab bar (Liquid Glass on iOS 26). */
export default function TabsLayout() {
  const theme = useTheme();
  return (
    <NativeTabs
      tintColor={theme.colors.primary}
      minimizeBehavior="onScrollDown"
      labelStyle={{ fontFamily: fontFamily.textMedium }}
    >
      {tabs.map((tab) => (
        <NativeTabs.Trigger
          key={tab.name}
          name={tab.name}
          {...(tab.role ? { role: tab.role } : {})}
        >
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
