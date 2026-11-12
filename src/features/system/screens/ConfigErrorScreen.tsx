import { StyleSheet, View } from 'react-native';

import { Card, EmptyState, Screen, Text } from '@/ui';

export interface ConfigErrorScreenProps {
  problems: string[];
}

/**
 * Shown instead of the app when the build is missing its public configuration. This only happens
 * in a misconfigured development or CI build, so the copy speaks to the developer.
 */
export function ConfigErrorScreen({ problems }: ConfigErrorScreenProps) {
  return (
    <Screen safeTop testID="config-error">
      <EmptyState
        tone="danger"
        icon="wrench.and.screwdriver"
        title="Famara isn't configured"
        message="This build is missing the settings it needs to reach Famara's servers."
      />
      <Card variant="sunken">
        <View style={styles.list}>
          {problems.map((problem) => (
            <Text key={problem} variant="footnote" tone="muted">
              {`• ${problem}`}
            </Text>
          ))}
        </View>
      </Card>
      <Text variant="footnote" tone="subtle" align="center">
        Copy .env.example to .env.local, fill in your Supabase project values, then restart the
        bundler.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
});
