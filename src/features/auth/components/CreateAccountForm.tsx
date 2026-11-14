import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, View, type TextInput } from 'react-native';

import { haptics } from '@/lib/haptics';
import { space } from '@/ui';

import { signUpWithEmail } from '../authActions';
import { usePendingEmail } from '../pendingEmail';
import { useField } from '../useField';
import { useSubmission } from '../useSubmission';
import {
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  validateEmail,
  validateNewPassword,
} from '../validation';
import { EmailField } from './EmailField';
import type { EmailFormProps } from './LogInForm';
import { NightNotice, NightPrimaryButton } from './NightControls';
import { PasswordField } from './PasswordField';
import { TermsCheckbox } from './TermsConsent';

const TERMS_REQUIRED = 'Please agree to the Terms and Privacy Policy to continue.';

/** Create an account with email and password. */
export function CreateAccountForm({ emailRef }: EmailFormProps) {
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
        router.push('/check-email');
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
    <View style={styles.form}>
      <EmailField
        {...(emailRef ? { ref: emailRef } : {})}
        field={email}
        testID="sign-up-email"
        returnKeyType="next"
        disabled={creation.busy}
        onReturn={() => passwordInput.current?.focus()}
      />
      <PasswordField
        ref={passwordInput}
        testID="sign-up-password"
        label="Password"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        purpose="new"
        value={password.value}
        onChangeText={password.setValue}
        onBlur={password.onBlur}
        error={password.error}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        disabled={creation.busy}
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
      />
      <TermsCheckbox
        checked={agreed}
        onChange={toggleTerms}
        error={showTermsError ? TERMS_REQUIRED : null}
      />
      <NightNotice message={creation.failure} testID="sign-up-error" />
      <NightPrimaryButton
        testID="sign-up-submit"
        label="Create account"
        loading={creation.busy}
        onPress={createAccount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
});
