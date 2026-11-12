import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, EmptyState, Screen, Text, toast, useTheme } from '@/ui';

import { hasSession, updatePassword } from '../authActions';
import { FormMessage } from '../components/FormMessage';
import { PasswordField } from '../components/PasswordField';
import { useField } from '../useField';
import { useSubmission } from '../useSubmission';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../validation';

/** Whether the recovery link left a session to change the password with. */
type LinkState = 'checking' | 'usable' | 'expired';

function useRecoveryLink(): [LinkState, (next: LinkState) => void] {
  const [linkState, setLinkState] = useState<LinkState>('checking');
  useEffect(() => {
    let current = true;
    void hasSession().then((present) => {
      if (current) setLinkState(present ? 'usable' : 'expired');
    });
    return () => {
      current = false;
    };
  }, []);
  return [linkState, setLinkState];
}

/** Choose a new password after opening a recovery link (which signed the person in). */
export function ResetPasswordScreen() {
  const router = useRouter();
  const theme = useTheme();
  const password = useField(validateNewPassword);
  const [linkState, setLinkState] = useRecoveryLink();
  const change = useSubmission();

  const saveNewPassword = () => {
    if (!password.validate()) {
      haptics.warning();
      return;
    }
    Keyboard.dismiss();
    void change.submit(async () => {
      const result = await updatePassword(password.value);
      if (!result.ok) {
        haptics.error();
        if (result.failure.kind === 'session_missing') setLinkState('expired');
        return result.failure.message;
      }
      haptics.success();
      toast.success('Your password has been updated.');
      router.replace('/');
      return null;
    });
  };

  if (linkState === 'checking') {
    return (
      <Screen scroll={false} contentContainerStyle={styles.centre}>
        <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Loading" />
      </Screen>
    );
  }

  if (linkState === 'expired') {
    return (
      <Screen>
        <EmptyState
          icon="key.fill"
          title="This link has expired"
          message="Password links work once and only for a short time. Ask for a new one."
          actionLabel="Get a new link"
          onAction={() => router.replace('/forgot-password')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          testID="new-password-submit"
          label="Save new password"
          size="lg"
          fullWidth
          loading={change.busy}
          onPress={saveNewPassword}
        />
      }
    >
      <View style={styles.heading}>
        <Text variant="title1">Choose a new password</Text>
        <Text variant="callout" tone="muted">
          You’ll use it the next time you sign in with your email.
        </Text>
      </View>
      {change.failure ? <FormMessage message={change.failure} /> : null}
      <PasswordField
        testID="new-password"
        label="New password"
        purpose="new"
        value={password.value}
        onChangeText={password.setValue}
        onBlur={password.onBlur}
        error={password.error}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        onSubmitEditing={saveNewPassword}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
