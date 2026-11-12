import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { Button, Card, ErrorState, Screen, Skeleton, Text, space } from '@/ui';

import { AccountError, accountUserQueryKey, fetchAccountUser } from '../account/accountApi';
import { useDataExport } from '../account/useDataExport';
import { ChangeEmailForm } from '../components/ChangeEmailForm';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { EXPORT_FOOTNOTE } from '../components/DataPrivacySection';
import { DeleteAccountCard } from '../components/DeleteAccountCard';

/** Email, password, data export and account deletion. */
export function AccountScreen() {
  const userId = useSessionStore((s) => s.userId);
  const user = useQuery({
    queryKey: accountUserQueryKey(userId),
    queryFn: fetchAccountUser,
    enabled: userId != null,
  });
  const exporter = useDataExport();

  if (user.isPending) {
    return (
      <Screen testID="account-screen">
        <Skeleton height={64} />
        <Skeleton height={200} />
      </Screen>
    );
  }
  if (user.isError) {
    return (
      <Screen testID="account-screen">
        <ErrorState
          error={user.error}
          {...(user.error instanceof AccountError ? { message: user.error.message } : {})}
          onRetry={() => void user.refetch()}
        />
      </Screen>
    );
  }

  const { email, pendingEmail, hasPassword } = user.data;
  return (
    <Screen testID="account-screen">
      <View style={styles.block}>
        <Text variant="footnote" tone="muted">
          Signed in as
        </Text>
        <Text variant="title3" selectable testID="account-email">
          {email ?? 'No email on this account'}
        </Text>
        {pendingEmail ? (
          <Text variant="footnote" tone="accent">
            {`Waiting for you to confirm ${pendingEmail}.`}
          </Text>
        ) : null}
      </View>

      <Card style={styles.card}>
        <ChangeEmailForm currentEmail={email} onChanged={() => void user.refetch()} />
      </Card>

      <Card style={styles.card}>
        <ChangePasswordForm
          email={email}
          hasPassword={hasPassword}
          onChanged={() => void user.refetch()}
        />
      </Card>

      <Card style={styles.card}>
        <Text variant="headline">Your data</Text>
        <Text variant="callout" tone="muted">
          {EXPORT_FOOTNOTE}
        </Text>
        <Button
          testID="account-export"
          label="Export my data"
          variant="secondary"
          icon="square.and.arrow.up"
          loading={exporter.exporting}
          disabled={exporter.exporting}
          onPress={() => void exporter.run()}
        />
      </Card>

      <DeleteAccountCard />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.xs },
  card: { gap: space.md },
});
