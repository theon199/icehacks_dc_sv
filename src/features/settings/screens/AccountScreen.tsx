import { useQuery } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { Button, Card, ErrorState, Skeleton, Text, fontFamily, space, useTheme } from '@/ui';

import { AccountError, accountUserQueryKey, fetchAccountUser } from '../account/accountApi';
import { useDataExport } from '../account/useDataExport';
import { ChangeEmailForm } from '../components/ChangeEmailForm';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { EXPORT_FOOTNOTE } from '../components/DataPrivacySection';
import { DeleteAccountCard } from '../components/DeleteAccountCard';
import { SettingsPage } from '../components/SettingsPage';

/** Email, password, data export and account deletion. */
export function AccountScreen() {
  const theme = useTheme();
  const userId = useSessionStore((s) => s.userId);
  const user = useQuery({
    queryKey: accountUserQueryKey(userId),
    queryFn: fetchAccountUser,
    enabled: userId != null,
  });
  const exporter = useDataExport();

  if (user.isPending) {
    return (
      <SettingsPage title="Account" testID="account-screen">
        <Skeleton height={96} radius="xl" />
        <Skeleton height={200} radius="xl" />
      </SettingsPage>
    );
  }
  if (user.isError) {
    return (
      <SettingsPage title="Account" testID="account-screen">
        <ErrorState
          error={user.error}
          {...(user.error instanceof AccountError ? { message: user.error.message } : {})}
          onRetry={() => void user.refetch()}
        />
      </SettingsPage>
    );
  }

  const { email, pendingEmail, hasPassword } = user.data;
  return (
    <SettingsPage title="Account" heading="Your sign-in and your data" testID="account-screen">
      <Text variant="body" tone="muted">
        Change how you sign in, take a copy of your data, or delete your account.
      </Text>

      <Card padding="section" style={[styles.card, { borderColor: theme.colors.border }]}>
        <Text variant="label" style={styles.label}>
          Signed in
        </Text>
        <Text variant="body" selectable testID="account-email">
          {email ?? 'No email on this account'}
        </Text>
        {pendingEmail ? (
          <Text variant="subhead" tone="muted">
            {`Waiting for you to confirm ${pendingEmail}.`}
          </Text>
        ) : null}
      </Card>

      <Card padding="section" style={[styles.card, { borderColor: theme.colors.border }]}>
        <ChangeEmailForm currentEmail={email} onChanged={() => void user.refetch()} />
      </Card>

      <Card padding="section" style={[styles.card, { borderColor: theme.colors.border }]}>
        <ChangePasswordForm
          email={email}
          hasPassword={hasPassword}
          onChanged={() => void user.refetch()}
        />
      </Card>

      <Card padding="section" style={[styles.card, { borderColor: theme.colors.border }]}>
        <Text variant="headline">Your data</Text>
        <Text variant="subhead" tone="muted">
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
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md, borderWidth: StyleSheet.hairlineWidth },
  label: { fontFamily: fontFamily.textBold },
});
