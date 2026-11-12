import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, EmptyState, Screen, Text, TextField } from '@/ui';

import { requestPasswordReset } from '../authActions';
import { FormMessage } from '../components/FormMessage';
import { useCooldown } from '../useCooldown';
import { useField } from '../useField';
import { normalizeEmail, validateEmail } from '../validation';

/** Asks for a password-reset link. The reply never says whether an account exists. */
export function ForgotPasswordScreen() {
  const router = useRouter();
  const email = useField(validateEmail);
  const cooldown = useCooldown();
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const send = async () => {
    if (sending || cooldown.remaining > 0) return;
    if (!email.validate()) {
      haptics.warning();
      return;
    }
    Keyboard.dismiss();
    setSending(true);
    setFailure(null);
    const result = await requestPasswordReset(email.value);
    setSending(false);
    if (result.ok) {
      haptics.success();
      setSentTo(normalizeEmail(email.value));
      cooldown.start();
      return;
    }
    haptics.error();
    setFailure(result.failure.message);
    if (result.failure.kind === 'rate_limited') cooldown.start();
  };

  const resendLabel =
    cooldown.remaining > 0 ? `Send again in ${cooldown.remaining}s` : 'Send the link again';

  if (sentTo) {
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
          message={`If there’s a Famara account for ${sentTo}, a link to choose a new password is on its way. Open it on this phone.`}
        />
        {failure ? <FormMessage message={failure} /> : null}
        <View style={styles.row}>
          <Button
            label={resendLabel}
            variant="secondary"
            icon="arrow.clockwise"
            loading={sending}
            disabled={cooldown.remaining > 0}
            onPress={() => void send()}
          />
          <Button label="Use a different email" variant="ghost" onPress={() => setSentTo(null)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          testID="reset-submit"
          label={cooldown.remaining > 0 ? resendLabel : 'Send reset link'}
          size="lg"
          fullWidth
          loading={sending}
          disabled={cooldown.remaining > 0}
          onPress={() => void send()}
        />
      }
    >
      <View style={styles.heading}>
        <Text variant="title1">Forgot your password?</Text>
        <Text variant="callout" tone="muted">
          Enter your email and we’ll send you a link to choose a new one.
        </Text>
      </View>
      {failure ? <FormMessage message={failure} /> : null}
      <TextField
        testID="reset-email"
        label="Email"
        value={email.value}
        onChangeText={email.setValue}
        onBlur={email.onBlur}
        error={email.error}
        icon="envelope.fill"
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="send"
        onSubmitEditing={() => void send()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  row: { alignItems: 'center', gap: 4 },
});
