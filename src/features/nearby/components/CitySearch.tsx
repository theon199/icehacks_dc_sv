import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, TextField } from '@/ui';

import type { CitySearchStatus } from '../hooks/useNearbyLocation';

export interface CitySearchProps {
  status: CitySearchStatus;
  onSearch: (query: string) => void;
  /** Label of the city currently searched, prefilled for editing. */
  initialQuery?: string;
}

const MESSAGES: Partial<Record<CitySearchStatus, string>> = {
  notFound: "We couldn't find that place. Try a city and state or country.",
  failed: "Searching for places isn't working right now. Check your connection and try again.",
};

/** Search by city or neighbourhood instead of the device location. */
export function CitySearch({ status, onSearch, initialQuery = '' }: CitySearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const trimmed = query.trim();
  const submit = () => {
    if (trimmed.length >= 2 && status !== 'searching') onSearch(trimmed);
  };
  return (
    <View style={styles.root}>
      <TextField
        label="City or neighborhood"
        placeholder="e.g. Austin, TX"
        icon="magnifyingglass"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={submit}
        returnKeyType="search"
        autoCorrect={false}
        autoComplete="off"
        textContentType="addressCityAndState"
        clearable
        error={MESSAGES[status] ?? null}
        testID="nearby-city-input"
      />
      <Button
        label="Search this area"
        onPress={submit}
        loading={status === 'searching'}
        disabled={trimmed.length < 2}
        testID="nearby-city-submit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
});
