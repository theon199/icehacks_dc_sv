import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, EmptyState, Screen, toast } from '@/ui';

import { resendConfirmation } from '../authActions';
import { FormMessage } from '../components/FormMessage';
import { usePendingEmail } from '../pendingEmail';
import { RESEND_COOLDOWN_SECONDS, useCooldown } from '../useCooldown';

function secondsLeft(sentAt: number | null): number {
  if (sentAt == null) return 0;
  return Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - sentAt) / 1000));
}

/** Waiting for the confirmation link, with a rate-limited "send again". */
export function CheckEmailScreen() {
  const router = useRouter();
  const email = usePendingEmail((s) => s.email);
  const sentAt = usePendingEmail((s) => s.sentAt);
  const cooldown = useCooldown(secondsLeft(sentAt));
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const resend = async () => {
    if (!email || sending || cooldown.remaining > 0) return;
    setSending(true);
    setFailure(null);
    const result = await resendConfirmation(email);
    setSending(false);
    if (result.ok) {
      haptics.success();
      usePendingEmail.getState().setPending(email);
      cooldown.start();
      toast.success('Sent. Check your inbox.');
      return;
    }
    haptics.error();
    setFailure(result.failure.message);
    if (result.failure.kind === 'rate_limited') cooldown.start();
  };

  const openMail = () => {
    // The Mail app's scheme; ignored quietly where there is no mail app.
    Linking.openURL(Platform.OS === 'ios' ? 'message://' : 'mailto:').catch(() => undefined);
  };

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          {Platform.OS === 'ios' ? (
            <Button label="Open Mail" icon="envelope.open" size="lg" fullWidth onPress={openMail} />
          ) : null}
          <Button
            label="Back to sign in"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/sign-in')}
          />
        </View>
      }
    >
      <EmptyState
        icon="envelope.badge"
        title="Check your email"
        message={
          email
            ? `We sent a confirmation link to ${email}. Open it on this phone to finish creating your account.`
            : 'Open the confirmation link we sent you on this phone to finish creating your account.'
        }
      />
      {failure ? <FormMessage message={failure} testID="resend-error" /> : null}
      {email ? (
        <Button
          testID="resend-confirmation"
          label={
            cooldown.remaining > 0 ? `Send again in ${cooldown.remaining}s` : 'Send the link again'
          }
          variant="secondary"
          icon="arrow.clockwise"
          loading={sending}
          disabled={cooldown.remaining > 0}
          onPress={() => void resend()}
          style={styles.resend}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: 4 },
  resend: { alignSelf: 'center' },
});
