import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/ui';

import { ChefChat, useAiAccess } from '../deps';

/**
 * The Chef segment. The chat appears only for people who may use AI (18+ with AI consent); this
 * pane is reachable without the AI route guard, so it applies the same rule itself.
 */
export function ChefPane() {
  const access = useAiAccess();
  const router = useRouter();
  if (access === 'allowed') {
    return (
      <View style={styles.flex} testID="chef-pane">
        <ChefChat />
      </View>
    );
  }
  if (access === 'needs_consent') {
    return (
      <EmptyState
        icon="sparkles"
        title="Meet Chef"
        message="Chef answers cooking questions and suggests recipes that fit you. Turn on AI features to start chatting."
        actionLabel="Review and turn on"
        onAction={() => router.push('/ai-consent')}
        style={styles.flex}
      />
    );
  }
  return (
    <EmptyState
      icon="lock"
      title="Chef is for adults"
      message="AI features are available from age 18. Search works just the same."
      style={styles.flex}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
