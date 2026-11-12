import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, EmptyState, Screen, Text } from '@/ui';

import { requestPasswordReset } from '../authActions';
import { EmailField } from '../components/EmailField';
import { FormMessage } from '../components/FormMessage';
import { useCooldown } from '../useCooldown';
import { useField } from '../useField';
import { useSubmission } from '../useSubmission';
import { normalizeEmail, validateEmail } from '../validation';

/** Asks for a password-reset link. The reply never says whether an account exists. */
export function ForgotPasswordScreen() {
  const router = useRouter();
  const email = useField(validateEmail);
  const cooldown = useCooldown();
  const request = useSubmission();
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const waiting = cooldown.remaining > 0;
  const againLabel = waiting ? `Send again in ${cooldown.remaining}s` : 'Send the link again';

  const sendLink = () => {
    if (waiting) return;
    if (!email.validate()) {
      haptics.warning();
      return;
    }
    Keyboard.dismiss();
    void request.submit(async () => {
      const result = await requestPasswordReset(email.value);
      if (!result.ok) {
        haptics.error();
        if (result.failure.kind === 'rate_limited') cooldown.start();
        return result.failure.message;
      }
      haptics.success();
      setLinkSentTo(normalizeEmail(email.value));
      cooldown.start();
      return null;
    });
  };

  const failureNote = request.failure ? <FormMessage message={request.failure} /> : null;

  if (linkSentTo) {
    return (
      <Screen
        footer={
          <Button
            label="Back to sign in"
            size="lg"
            fullWidth
            onPress={() => router.replace('/sign-in')}
          />
        }
      >
        <EmptyState
          icon="envelope.badge"
          title="Check your email"
          message={`If there’s a Famara account for ${linkSentTo}, a link to choose a new password is on its way. Open it on this phone.`}
        />
        {failureNote}
        <View style={styles.row}>
          <Button
            label={againLabel}
            variant="secondary"
            icon="arrow.clockwise"
            loading={request.busy}
            disabled={waiting}
            onPress={sendLink}
          />
          <Button
            label="Use a different email"
            variant="ghost"
            onPress={() => setLinkSentTo(null)}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          testID="reset-submit"
          label={waiting ? againLabel : 'Send reset link'}
          size="lg"
          fullWidth
          loading={request.busy}
          disabled={waiting}
          onPress={sendLink}
        />
      }
    >
      <View style={styles.heading}>
        <Text variant="title1">Forgot your password?</Text>
        <Text variant="callout" tone="muted">
          Enter your email and we’ll send you a link to choose a new one.
        </Text>
      </View>
      {failureNote}
      <EmailField field={email} testID="reset-email" returnKeyType="send" onReturn={sendLink} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  row: { alignItems: 'center', gap: 4 },
});
