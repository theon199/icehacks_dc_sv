import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, View, type TextInput } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, Screen, Text } from '@/ui';

import { signUpWithEmail } from '../authActions';
import { EmailField } from '../components/EmailField';
import { FormMessage } from '../components/FormMessage';
import { PasswordField } from '../components/PasswordField';
import { TermsCheckbox } from '../components/TermsConsent';
import { usePendingEmail } from '../pendingEmail';
import { useField } from '../useField';
import { useSubmission } from '../useSubmission';
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
  const passwordInput = useRef<TextInput>(null);
  const creation = useSubmission();
  const [agreed, setAgreed] = useState(false);
  const [showTermsError, setShowTermsError] = useState(false);

  const createAccount = () => {
    const fieldsOk = [email.validate(), password.validate()].every(Boolean);
    setShowTermsError(!agreed);
    if (!fieldsOk || !agreed) {
      haptics.warning();
      return;
    }
    Keyboard.dismiss();
    void creation.submit(async () => {
      const result = await signUpWithEmail(email.value, password.value);
      if (!result.ok) {
        haptics.error();
        return result.failure.message;
      }
      haptics.success();
      if (result.value.needsConfirmation) {
        usePendingEmail.getState().setPending(normalizeEmail(email.value));
        router.replace('/check-email');
      }
      // Otherwise a session already exists and the guard moves on to setup.
      return null;
    });
  };

  const toggleTerms = (next: boolean) => {
    setAgreed(next);
    if (next) setShowTermsError(false);
  };

  return (
    <Screen
      footer={
        <Button
          testID="sign-up-submit"
          label="Create account"
          size="lg"
          fullWidth
          loading={creation.busy}
          onPress={createAccount}
        />
      }
    >
      <View style={styles.heading}>
        <Text variant="title1">Create your account</Text>
        <Text variant="callout" tone="muted">
          We’ll send a link to confirm your email.
        </Text>
      </View>

      {creation.failure ? <FormMessage message={creation.failure} testID="sign-up-error" /> : null}

      <EmailField
        field={email}
        testID="sign-up-email"
        returnKeyType="next"
        onReturn={() => passwordInput.current?.focus()}
      />
      <PasswordField
        ref={passwordInput}
        testID="sign-up-password"
        label="Password"
        purpose="new"
        value={password.value}
        onChangeText={password.setValue}
        onBlur={password.onBlur}
        error={password.error}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
      />
      <TermsCheckbox
        checked={agreed}
        onChange={toggleTerms}
        error={showTermsError ? TERMS_REQUIRED : null}
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
