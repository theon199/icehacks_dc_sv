import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, View, type TextInput } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, Screen, Text, TextField } from '@/ui';

import { signInWithEmail } from '../authActions';
import { FormMessage } from '../components/FormMessage';
import { PasswordField } from '../components/PasswordField';
import { usePendingEmail } from '../pendingEmail';
import { useField } from '../useField';
import { normalizeEmail, validateEmail, validateSignInPassword } from '../validation';

/** Email and password sign-in. Success needs no navigation: the session guard moves on. */
export function SignInScreen() {
  const router = useRouter();
  const email = useField(validateEmail);
  const password = useField(validateSignInPassword);
  const passwordRef = useRef<TextInput>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);

  const submit = async () => {
    if (submitting) return;
    const emailOk = email.validate();
    const passwordOk = password.validate();
    if (!emailOk || !passwordOk) {
      haptics.warning();
      return;
    }
    Keyboard.dismiss();
    setSubmitting(true);
    setFailure(null);
    setUnconfirmed(false);
    const result = await signInWithEmail(email.value, password.value);
    setSubmitting(false);
    if (result.ok) {
      haptics.success();
      return;
    }
    haptics.error();
    setFailure(result.failure.message);
    setUnconfirmed(result.failure.kind === 'email_not_confirmed');
  };

  const openConfirmation = () => {
    usePendingEmail.getState().setPending(normalizeEmail(email.value), null);
    router.push('/check-email');
  };

  return (
    <Screen
      footer={
        <Button
          testID="sign-in-submit"
          label="Sign in"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={() => void submit()}
        />
      }
    >
      <View style={styles.heading}>
        <Text variant="title1">Welcome back</Text>
        <Text variant="callout" tone="muted">
          Sign in with the email you used to create your account.
        </Text>
      </View>

      {failure ? <FormMessage message={failure} testID="sign-in-error" /> : null}
      {unconfirmed ? (
        <Button
          label="Send the confirmation link again"
          variant="secondary"
          icon="envelope.badge"
          onPress={openConfirmation}
        />
      ) : null}

      <TextField
        testID="sign-in-email"
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
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <PasswordField
        ref={passwordRef}
        testID="sign-in-password"
        label="Password"
        purpose="current"
        value={password.value}
        onChangeText={password.setValue}
        onBlur={password.onBlur}
        error={password.error}
        onSubmitEditing={() => void submit()}
      />

      <View style={styles.links}>
        <Button
          label="Forgot password?"
          variant="ghost"
          size="sm"
          onPress={() => router.push('/forgot-password')}
        />
        <Button
          label="Create an account"
          variant="ghost"
          size="sm"
          onPress={() => router.replace('/sign-up')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
});
