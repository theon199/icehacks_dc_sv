import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, toast, useTheme } from '@/ui';

import { hasSession, updatePassword } from '../authActions';
import { AccountPage, PageNotice } from '../components/AccountPage';
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
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Loading" />
      </View>
    );
  }

  if (linkState === 'expired') {
    return (
      <AccountPage
        title="This link has expired."
        subtitle="Password links work once and only for a short time. Ask for a new one."
      >
        <Button
          label="Get a new link"
          size="lg"
          fullWidth
          onPress={() => router.replace('/forgot-password')}
        />
      </AccountPage>
    );
  }

  return (
    <AccountPage
      title="Choose a new password."
      subtitle="You’ll use it the next time you log in with your email."
    >
      <PasswordField
        testID="new-password"
        look="page"
        label="New password"
        purpose="new"
        value={password.value}
        onChangeText={password.setValue}
        onBlur={password.onBlur}
        error={password.error}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        onSubmitEditing={saveNewPassword}
      />
      <PageNotice message={change.failure} />
      <Button
        testID="new-password-submit"
        label="Save new password"
        size="lg"
        fullWidth
        loading={change.busy}
        onPress={saveNewPassword}
      />
    </AccountPage>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
