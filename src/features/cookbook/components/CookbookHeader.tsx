import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Header, IconButton, minTouchTarget, space, useTheme } from '@/ui';

const openShopping = () => router.push('/shopping');
const openSettings = () => router.push('/settings');
const openProfile = () => router.push('/profile');

/**
 * The Cookbook title row: shopping and settings share one glass pill, the profile sits in its own
 * glass disc beside it.
 */
export const CookbookHeader = memo(function CookbookHeader() {
  const theme = useTheme();
  return (
    <Header
      size="tab"
      title="Cookbook"
      trailing={
        <>
          <View
            style={[
              styles.group,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.pill,
                shadowColor: theme.colors.shadow,
                ...theme.elevation.low,
              },
            ]}
          >
            <IconButton
              icon="cart"
              accessibilityLabel="Shopping list"
              onPress={openShopping}
              size={minTouchTarget}
              testID="cookbook-shopping"
            />
            <IconButton
              icon="gearshape"
              accessibilityLabel="Settings"
              onPress={openSettings}
              size={minTouchTarget}
              testID="cookbook-settings"
            />
          </View>
          <IconButton
            icon="person"
            variant="glass"
            accessibilityLabel="Profile"
            onPress={openProfile}
            testID="cookbook-profile"
          />
        </>
      }
    />
  );
});

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xxs,
  },
});
