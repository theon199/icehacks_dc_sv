import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, SheetContent, Text, useTheme } from '@/ui';

import { ProviderButtons } from '../components/ProviderButtons';
import { LegalNote } from '../components/TermsConsent';

/** The sign-in sheet: Apple, Google, or email to create an account or sign in. */
export function ContinueSheet() {
  const router = useRouter();
  const theme = useTheme();
  return (
    <SheetContent
      title="Join Famara"
      description="Sign in or create a free account to save recipes and plan your week."
    >
      <ProviderButtons />
      <View
        style={styles.divider}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />
        <Text variant="footnote" tone="subtle">
          or
        </Text>
        <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />
      </View>
      <Button
        testID="continue-email"
        label="Continue with email"
        icon="envelope.fill"
        variant="secondary"
        size="lg"
        fullWidth
        onPress={() => router.replace('/sign-up')}
      />
      <Button
        label="Sign in with email"
        variant="ghost"
        fullWidth
        onPress={() => router.replace('/sign-in')}
      />
      <LegalNote fromSheet />
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
