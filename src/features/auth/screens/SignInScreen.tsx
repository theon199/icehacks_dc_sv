import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, View, type TextInput } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, Screen, Text } from '@/ui';

import { signInWithEmail } from '../authActions';
import { EmailField } from '../components/EmailField';
import { FormMessage } from '../components/FormMessage';
import { PasswordField } from '../components/PasswordField';
import { usePendingEmail } from '../pendingEmail';
import { useField } from '../useField';
import { useSubmission } from '../useSubmission';
import { normalizeEmail, validateEmail, validateSignInPassword } from '../validation';

/** Email and password sign-in. Success needs no navigation: the session guard moves on. */
export function SignInScreen() {
  const router = useRouter();
  const email = useField(validateEmail);
  const password = useField(validateSignInPassword);
  const passwordInput = useRef<TextInput>(null);
  const attempt = useSubmission();
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const signIn = () => {
    const fieldsOk = [email.validate(), password.validate()].every(Boolean);
    if (!fieldsOk) {
      haptics.warning();
      return;
    }
    Keyboard.dismiss();
    void attempt.submit(async () => {
      setAwaitingConfirmation(false);
      const result = await signInWithEmail(email.value, password.value);
      if (result.ok) {
        haptics.success();
        return null;
      }
      haptics.error();
      setAwaitingConfirmation(result.failure.kind === 'email_not_confirmed');
      return result.failure.message;
    });
  };

  const resendConfirmation = () => {
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
          loading={attempt.busy}
          onPress={signIn}
        />
      }
    >
      <View style={styles.heading}>
        <Text variant="title1">Welcome back</Text>
        <Text variant="callout" tone="muted">
          Sign in with the email you used to create your account.
        </Text>
      </View>

      {attempt.failure ? <FormMessage message={attempt.failure} testID="sign-in-error" /> : null}
      {awaitingConfirmation ? (
        <Button
          label="Send the confirmation link again"
          variant="secondary"
          icon="envelope.badge"
          onPress={resendConfirmation}
        />
      ) : null}

      <EmailField
        field={email}
        testID="sign-in-email"
        returnKeyType="next"
        onReturn={() => passwordInput.current?.focus()}
      />
      <PasswordField
        ref={passwordInput}
        testID="sign-in-password"
        label="Password"
        purpose="current"
        value={password.value}
        onChangeText={password.setValue}
        onBlur={password.onBlur}
        error={password.error}
        onSubmitEditing={signIn}
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
