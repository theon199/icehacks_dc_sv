import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, View, type TextInput } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, Screen, Text, TextField } from '@/ui';

import { signUpWithEmail } from '../authActions';
import { FormMessage } from '../components/FormMessage';
import { PasswordField } from '../components/PasswordField';
import { TermsCheckbox } from '../components/TermsConsent';
import { usePendingEmail } from '../pendingEmail';
import { useField } from '../useField';
import {
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  validateEmail,
  validateNewPassword,
} from '../validation';

const TERMS_REQUIRED = 'Please agree to the Terms and Privacy Policy to continue.';

/** Create an account with email and password. */
export function SignUpScreen() {
  const router = useRouter();
  const email = useField(validateEmail);
  const password = useField(validateNewPassword);
  const passwordRef = useRef<TextInput>(null);
  const [agreed, setAgreed] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async () => {
    if (submitting) return;
    const emailOk = email.validate();
    const passwordOk = password.validate();
    setTermsError(agreed ? null : TERMS_REQUIRED);
    if (!emailOk || !passwordOk || !agreed) {
      haptics.warning();
      return;
    }
    Keyboard.dismiss();
    setSubmitting(true);
    setFailure(null);
    const result = await signUpWithEmail(email.value, password.value);
    setSubmitting(false);
    if (!result.ok) {
      haptics.error();
      setFailure(result.failure.message);
      return;
    }
    haptics.success();
    if (result.value.needsConfirmation) {
      usePendingEmail.getState().setPending(normalizeEmail(email.value));
      router.replace('/check-email');
    }
    // Otherwise a session already exists and the guard moves on to setup.
  };

  return (
    <Screen
      footer={
        <Button
          testID="sign-up-submit"
          label="Create account"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={() => void submit()}
        />
      }
    >
      <View style={styles.heading}>
        <Text variant="title1">Create your account</Text>
        <Text variant="callout" tone="muted">
          We’ll send a link to confirm your email.
        </Text>
      </View>

      {failure ? <FormMessage message={failure} testID="sign-up-error" /> : null}

      <TextField
        testID="sign-up-email"
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
        testID="sign-up-password"
        label="Password"
        purpose="new"
        value={password.value}
        onChangeText={password.setValue}
        onBlur={password.onBlur}
        error={password.error}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        returnKeyType="done"
        onSubmitEditing={() => Keyboard.dismiss()}
      />
      <TermsCheckbox
        checked={agreed}
        onChange={(next) => {
          setAgreed(next);
          if (next) setTermsError(null);
        }}
        error={termsError}
      />

      <Button
        label="I already have an account"
        variant="ghost"
        size="sm"
        onPress={() => router.replace('/sign-in')}
        style={styles.link}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  link: { alignSelf: 'center' },
});
