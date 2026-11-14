import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, PressableScale, Text, gutter, space } from '@/ui';

import { night, nightOutline } from '../components/NightTheme';
import { ProviderButtons } from '../components/ProviderButtons';
import { LegalNote } from '../components/TermsConsent';

/** The sign-in sheet: Apple, Google, or email to create an account or sign in. */
export function ContinueSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: night.raised }]}
      contentContainerStyle={[
        styles.body,
        { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text
          variant="display"
          style={[styles.headline, styles.grow]}
          accessibilityLabel="Let’s get you cooking. Sign in or create a free account."
        >
          {'Let’s get you\n'}
          <Text variant="display" color="highlight" style={styles.headline}>
            cooking.
          </Text>
        </Text>
        <IconButton
          icon="xmark"
          accessibilityLabel="Close"
          size={44}
          style={styles.close}
          onPress={() => router.back()}
        />
      </View>

      <ProviderButtons />
      <Button
        testID="continue-email"
        label="Continue with email"
        icon="envelope"
        variant="secondary"
        size="lg"
        fullWidth
        style={nightOutline}
        onPress={() => router.replace('/sign-up')}
      />

      <LegalNote fromSheet />

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Have an account? Log in"
        pressedOpacity={0.6}
        onPress={() => router.replace('/sign-in')}
        style={styles.login}
      >
        <Text variant="label" tone="muted" accessible={false}>
          Have an account?{' '}
          <Text variant="label" accessible={false}>
            Log in
          </Text>
        </Text>
      </PressableScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: gutter, paddingTop: space.xxl, gap: space.md },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: space.sm,
  },
  headline: { fontSize: 38, lineHeight: 42, letterSpacing: -0.9 },
  grow: { flex: 1 },
  close: { backgroundColor: night.control },
  login: { minHeight: 44, alignSelf: 'center', justifyContent: 'center' },
});
