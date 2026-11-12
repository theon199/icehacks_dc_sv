import { StyleSheet, View } from 'react-native';

import { Button, errorMessageFor, Icon, Text, useTheme } from '@/ui';
import { space } from '@/ui/tokens';

export interface SearchErrorBannerProps {
  error: unknown;
  onRetry: () => void;
}

/**
 * Sits above results that are already on screen when loading more (or refreshing) fails, so the
 * grid stays usable and the person still learns that something is missing.
 */
export function SearchErrorBanner({ error, onRetry }: SearchErrorBannerProps) {
  const theme = useTheme();
  return (
    <View
      testID="search-error-banner"
      accessibilityRole="alert"
      style={[
        styles.card,
        { backgroundColor: theme.colors.dangerSoft, borderRadius: theme.radii.lg },
      ]}
    >
      <Icon name="exclamationmark.triangle" android="warning" size={20} color="onDangerSoft" />
      <View style={styles.text}>
        <Text variant="subhead" color="onDangerSoft">
          Some results didn’t load
        </Text>
        <Text variant="footnote" color="onDangerSoft">
          {errorMessageFor(error)}
        </Text>
      </View>
      <Button label="Retry" size="sm" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    marginBottom: space.md,
  },
  text: { flex: 1, gap: space.xxs },
});
