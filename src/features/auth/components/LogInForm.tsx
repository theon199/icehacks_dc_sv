import { useRouter } from 'expo-router';
import { useRef, useState, type Ref } from 'react';
import { Keyboard, StyleSheet, View, type TextInput } from 'react-native';

import { haptics } from '@/lib/haptics';
import { space } from '@/ui';

import { signInWithEmail } from '../authActions';
import { usePendingEmail } from '../pendingEmail';
import { useField } from '../useField';
import { useSubmission } from '../useSubmission';
import { normalizeEmail, validateEmail, validateSignInPassword } from '../validation';
import { EmailField } from './EmailField';
import {
  NightNotice,
  NightPrimaryButton,
  NightSecondaryButton,
  NightTextLink,
} from './NightControls';
import { PasswordField } from './PasswordField';

export interface EmailFormProps {
  /** The email input, so the sheet can put the caret there once the form has arrived. */
  emailRef?: Ref<TextInput>;
}

/** Email and password log-in. Success needs no navigation: the session guard moves on. */
export function LogInForm({ emailRef }: EmailFormProps) {
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
    <View style={styles.form}>
      <EmailField
        {...(emailRef ? { ref: emailRef } : {})}
        field={email}
        testID="sign-in-email"
        returnKeyType="next"
        disabled={attempt.busy}
        onReturn={() => passwordInput.current?.focus()}
      />
      <PasswordField
        ref={passwordInput}
        testID="sign-in-password"
        label="Password"
        placeholder="Your password"
        purpose="current"
        value={password.value}
        onChangeText={password.setValue}
        onBlur={password.onBlur}
        error={password.error}
        disabled={attempt.busy}
        onSubmitEditing={signIn}
      />
      <NightNotice message={attempt.failure} testID="sign-in-error">
        {awaitingConfirmation ? (
          <NightSecondaryButton
            label="Send the confirmation link again"
            icon="envelope.badge"
            onPress={resendConfirmation}
          />
        ) : null}
      </NightNotice>
      <View style={styles.actions}>
        <NightTextLink
          label="Forgot password?"
          align="start"
          disabled={attempt.busy}
          onPress={() => router.push('/forgot-password')}
        />
        <NightPrimaryButton
          testID="sign-in-submit"
          label="Log in"
          loading={attempt.busy}
          disabled={email.value.trim() === '' || password.value === ''}
          onPress={signIn}
          style={styles.submit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.md,
    marginTop: space.xs,
  },
  submit: { minWidth: 150 },
});
