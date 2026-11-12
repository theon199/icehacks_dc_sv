import { Stack, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, useTheme } from '@/ui';

import { LocationPrompt } from '../components/LocationPrompt';
import { NearbyResults } from '../components/NearbyResults';
import { useNearbyDish } from '../hooks/useNearbyDish';
import { useNearbyLocation } from '../hooks/useNearbyLocation';
import type { NearbyDish } from '../model/dish';
import type { LocationService } from '../services/location';

export interface NearbyScreenProps {
  /** Route param: a catalog recipe id or a dish name. */
  dish: string;
  /** Replaces the device location service (tests, previews). */
  locationService?: LocationService;
}

function NearbyForDish({
  dish,
  locationService,
}: {
  dish: NearbyDish;
  locationService?: LocationService;
}) {
  const location = useNearbyLocation(locationService);
  if (!location.origin) return <LocationPrompt dishName={dish.name} location={location} />;
  return <NearbyResults dish={dish} origin={location.origin} location={location} />;
}

/** Restaurants near the person that may serve a dish. */
export function NearbyScreen({ dish: param, locationService }: NearbyScreenProps) {
  const theme = useTheme();
  const state = useNearbyDish(param);

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Loading" />
      </View>
    );
  }

  if (state.status === 'invalid') {
    return (
      <Screen>
        <EmptyState
          icon="questionmark.circle"
          title="We couldn't tell which dish"
          message="Open Nearby from a recipe to find restaurants that serve it."
          actionLabel="Go back"
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: state.dish.name }} />
      <NearbyForDish dish={state.dish} {...(locationService ? { locationService } : {})} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
