import { Stack, router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, useTheme } from '@/ui';

import { LocationPrompt } from '../components/LocationPrompt';
import { BelowNearbyHeader, NearbyHeader } from '../components/NearbyHeader';
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
  const { origin } = location;
  const area = origin
    ? origin.source === 'city' && origin.label
      ? `Near ${origin.label}`
      : 'Near you'
    : null;
  return (
    <>
      {origin ? (
        <NearbyResults dish={dish} origin={origin} location={location} />
      ) : (
        <BelowNearbyHeader>
          <LocationPrompt dishName={dish.name} location={location} />
        </BelowNearbyHeader>
      )}
      <NearbyHeader
        title={`${dish.name} nearby`}
        subtitle={area}
        onBack={goBack}
        onChangeArea={origin ? location.chooseCity : null}
      />
    </>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Restaurants near the person that may serve a dish. */
export function NearbyScreen({ dish: param, locationService }: NearbyScreenProps) {
  const theme = useTheme();
  const state = useNearbyDish(param);

  let content: ReactNode;
  if (state.status === 'loading') {
    content = (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Loading" />
      </View>
    );
  } else if (state.status === 'invalid') {
    content = (
      <BelowNearbyHeader>
        <Screen>
          <EmptyState
            icon="questionmark.circle"
            title="We couldn't tell which dish"
            message="Open Nearby from a recipe to find restaurants that serve it."
            actionLabel="Go back"
            onAction={goBack}
          />
        </Screen>
      </BelowNearbyHeader>
    );
  } else {
    content = <NearbyForDish dish={state.dish} {...(locationService ? { locationService } : {})} />;
  }

  return (
    <View
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID="nearby-screen"
    >
      {/* The screen floats its own glass header over the map. */}
      <Stack.Screen options={{ headerShown: false }} />
      {content}
      {state.status === 'ready' ? null : (
        <NearbyHeader title="Find nearby" subtitle={null} onBack={goBack} onChangeArea={null} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
