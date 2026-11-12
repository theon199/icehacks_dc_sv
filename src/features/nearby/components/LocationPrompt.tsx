import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, EmptyState, Screen, Text, useTheme } from '@/ui';

import { CitySearch } from './CitySearch';
import type { NearbyLocation } from '../hooks/useNearbyLocation';

export interface LocationPromptProps {
  dishName: string;
  location: NearbyLocation;
}

function Busy({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.busy} accessible accessibilityLabel={label} testID="nearby-locating">
      <ActivityIndicator color={theme.colors.primary} />
      <Text variant="subhead" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/**
 * Everything before there is a place to search from: explanation, the system prompt, refusal
 * and the city search fallback.
 */
export function LocationPrompt({ dishName, location }: LocationPromptProps) {
  const { state } = location;

  switch (state.step) {
    case 'checking':
      return <Busy label="Checking location access" />;
    case 'requesting':
    case 'locating':
      return <Busy label="Finding where you are" />;
    case 'explain':
      return (
        <Screen>
          <EmptyState
            icon="location.circle"
            title={`Find ${dishName} near you`}
            message="Famara uses your location only while you're using this screen, to find restaurants close by. It's never shared with other members."
            actionLabel="Use my location"
            onAction={location.requestPermission}
          >
            <Button
              label="Search a city instead"
              variant="ghost"
              onPress={location.chooseCity}
              testID="nearby-choose-city"
            />
          </EmptyState>
        </Screen>
      );
    case 'blocked':
      return (
        <Screen>
          <EmptyState
            icon="location.slash"
            title="Location is off for Famara"
            message="Turn on location in Settings to search around you, or search a city instead."
            actionLabel="Open Settings"
            onAction={location.openSettings}
          >
            <Button
              label="Search a city instead"
              variant="ghost"
              onPress={location.chooseCity}
              testID="nearby-choose-city"
            />
          </EmptyState>
        </Screen>
      );
    case 'unavailable':
      return (
        <Screen>
          <EmptyState
            icon="location.slash"
            title="We couldn't find your location"
            message="Your position isn't available right now. Search a city instead, or try again outdoors."
            actionLabel="Search a city"
            onAction={location.chooseCity}
          >
            <Button label="Try again" variant="ghost" onPress={location.useDevice} />
          </EmptyState>
        </Screen>
      );
    case 'manual':
      return (
        <Screen>
          <View style={styles.manual}>
            <Text variant="title2">Where should we look?</Text>
            <Text variant="callout" tone="muted">
              {`Search a city or neighborhood to find ${dishName} there.`}
            </Text>
            <CitySearch status={location.citySearch} onSearch={location.searchCity} />
            <Button
              label="Use my location"
              icon="location"
              variant="ghost"
              onPress={location.useDevice}
            />
          </View>
        </Screen>
      );
    case 'located':
      return null;
  }
}

const styles = StyleSheet.create({
  busy: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  manual: { gap: 12, paddingTop: 16 },
});
