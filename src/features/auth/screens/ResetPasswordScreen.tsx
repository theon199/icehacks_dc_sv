import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, EmptyState, Screen, Text, toast, useTheme } from '@/ui';

import { hasSession, updatePassword } from '../authActions';
import { FormMessage } from '../components/FormMessage';
import { PasswordField } from '../components/PasswordField';
import { useField } from '../useField';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../validation';

type Readiness = 'checking' | 'ready' | 'expired';

/** Choose a new password after opening a recovery link (which signed the person in). */
export function ResetPasswordScreen() {
  const router = useRouter();
  const theme = useTheme();
  const password = useField(validateNewPassword);
  const [readiness, setReadiness] = useState<Readiness>('checking');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void hasSession().then((present) => {
      if (mounted) setReadiness(present ? 'ready' : 'expired');
    });
    return () => {
      mounted = false;
    };
  }, []);

  const save = async () => {
    if (saving) return;
    if (!password.validate()) {
      haptics.warning();
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    setFailure(null);
    const result = await updatePassword(password.value);
    setSaving(false);
    if (result.ok) {
      haptics.success();
      toast.success('Your password has been updated.');
      router.replace('/');
      return;
    }
    haptics.error();
    if (result.failure.kind === 'session_missing') setReadiness('expired');
    setFailure(result.failure.message);
  };

  if (readiness === 'checking') {
    return (
      <Screen scroll={false} contentContainerStyle={styles.centre}>
        <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Loading" />
      </Screen>
    );
  }

  if (readiness === 'expired') {
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
          loading={saving}
          onPress={() => void save()}
        />
      }
    >
      <View style={styles.heading}>
        <Text variant="title1">Choose a new password</Text>
        <Text variant="callout" tone="muted">
          You’ll use it the next time you sign in with your email.
        </Text>
      </View>
      {failure ? <FormMessage message={failure} /> : null}
      <PasswordField
        testID="new-password"
        label="New password"
        purpose="new"
        value={password.value}
        onChangeText={password.setValue}
        onBlur={password.onBlur}
        error={password.error}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        onSubmitEditing={() => void save()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
